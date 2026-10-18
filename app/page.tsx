"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Matter,
  MatterDraft,
  clearDraft,
  loadDraft,
  loadMatters,
  saveDraft,
  saveMatter,
} from "./storage";

type Period = "day" | "week" | "month";
type EditorKey = "new" | string | null;

const emptyDraft = (): MatterDraft => ({
  title: "",
  details: "",
  promisedAt: "",
  dueAt: "",
});

const localDateValue = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

const periodBounds = (value: string, period: Period) => {
  const base = new Date(`${value}T00:00:00`);
  const start = new Date(base);
  const end = new Date(base);

  if (period === "week") {
    const fromMonday = (base.getDay() + 6) % 7;
    start.setDate(base.getDate() - fromMonday);
    end.setDate(start.getDate() + 6);
  } else if (period === "month") {
    start.setDate(1);
    end.setMonth(start.getMonth() + 1, 0);
  }

  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const dateTime = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const shortDate = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const formatDateTime = (value: string) => dateTime.format(new Date(value));

export default function Home() {
  const [matters, setMatters] = useState<Matter[]>([]);
  const [period, setPeriod] = useState<Period>("week");
  const [cursor, setCursor] = useState(() => localDateValue(new Date()));
  const [query, setQuery] = useState("");
  const [editorKey, setEditorKey] = useState<EditorKey>(null);
  const [draft, setDraft] = useState<MatterDraft | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMatters()
      .then(({ matters: loaded, skipped }) => {
        setMatters(loaded);
        if (skipped) {
          setWarning(
            `Пропущено повреждённых записей: ${skipped}. Остальные дела доступны.`,
          );
        }
      })
      .catch(() =>
        setWarning("Локальное хранилище недоступно. Перезагрузите приложение."),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (editorKey && draft) saveDraft(editorKey, draft);
  }, [editorKey, draft]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setEditorKey(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const bounds = useMemo(() => periodBounds(cursor, period), [cursor, period]);

  const visibleMatters = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru");
    return matters
      .filter((matter) => {
        if (normalized) {
          return [
            matter.title,
            matter.details,
            ...matter.comments.map((item) => item.text),
          ].some((value) => value.toLocaleLowerCase("ru").includes(normalized));
        }
        const due = new Date(matter.dueAt);
        return due >= bounds.start && due <= bounds.end;
      })
      .sort((a, b) => {
        if (Boolean(a.closedAt) !== Boolean(b.closedAt)) return a.closedAt ? 1 : -1;
        return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      });
  }, [bounds, matters, query]);

  const selectedMatter =
    editorKey && editorKey !== "new"
      ? matters.find((matter) => matter.id === editorKey) ?? null
      : null;

  const openNew = () => {
    setEditorKey("new");
    setDraft(loadDraft("new") ?? emptyDraft());
    setComment("");
    setError("");
  };

  const openMatter = (matter: Matter) => {
    setEditorKey(matter.id);
    setDraft(
      loadDraft(matter.id) ?? {
        title: matter.title,
        details: matter.details,
        promisedAt: matter.promisedAt,
        dueAt: matter.dueAt,
      },
    );
    setComment(loadDraft(`comment-${matter.id}`)?.details ?? "");
    setError("");
  };

  const validate = () => {
    if (!draft?.title.trim()) return "Укажите название дела.";
    if (!draft.promisedAt || !draft.dueAt) return "Укажите обе даты.";
    if (Number.isNaN(Date.parse(draft.promisedAt)) || Number.isNaN(Date.parse(draft.dueAt))) {
      return "Проверьте даты.";
    }
    if (new Date(draft.dueAt) < new Date(draft.promisedAt)) {
      return "Срок завершения не может быть раньше даты обещания.";
    }
    return "";
  };

  const persist = async (close = false) => {
    const validationError = validate();
    if (validationError || !draft) {
      setError(validationError);
      return;
    }

    const now = new Date().toISOString();
    const existing = selectedMatter;
    const matter: Matter = {
      version: 1,
      id: existing?.id ?? crypto.randomUUID(),
      title: draft.title.trim(),
      details: draft.details.trim(),
      promisedAt: draft.promisedAt,
      dueAt: draft.dueAt,
      closedAt: close ? now : (existing?.closedAt ?? null),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      comments: existing?.comments ?? [],
    };

    try {
      await saveMatter(matter);
      setMatters((current) => [
        ...current.filter((item) => item.id !== matter.id),
        matter,
      ]);
      clearDraft(editorKey ?? "new");
      setEditorKey(null);
      setDraft(null);
      setError("");
    } catch {
      setError("Не удалось сохранить дело. Введённые данные остались в черновике.");
    }
  };

  const submitMatter = (event: FormEvent) => {
    event.preventDefault();
    void persist(false);
  };

  const addComment = async (event: FormEvent) => {
    event.preventDefault();
    const text = comment.trim();
    if (!selectedMatter || !text) return;

    const updated: Matter = {
      ...selectedMatter,
      updatedAt: new Date().toISOString(),
      comments: [
        ...selectedMatter.comments,
        { id: crypto.randomUUID(), text, createdAt: new Date().toISOString() },
      ],
    };

    try {
      await saveMatter(updated);
      setMatters((current) =>
        current.map((matter) => (matter.id === updated.id ? updated : matter)),
      );
      setComment("");
      clearDraft(`comment-${selectedMatter.id}`);
    } catch {
      setError("Не удалось добавить комментарий. Текст остался в поле.");
    }
  };

  const changeComment = (value: string) => {
    setComment(value);
    if (selectedMatter) {
      saveDraft(`comment-${selectedMatter.id}`, {
        title: "",
        details: value,
        promisedAt: "",
        dueAt: "",
      });
    }
  };

  const shiftCursor = (direction: number) => {
    const next = new Date(`${cursor}T00:00:00`);
    if (period === "day") next.setDate(next.getDate() + direction);
    if (period === "week") next.setDate(next.getDate() + direction * 7);
    if (period === "month") next.setMonth(next.getMonth() + direction);
    setCursor(localDateValue(next));
  };

  const rangeLabel =
    period === "day"
      ? shortDate.format(bounds.start)
      : `${shortDate.format(bounds.start)} — ${shortDate.format(bounds.end)}`;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Локально · без сети</p>
          <h1>Дневник обещаний</h1>
        </div>
        <button className="primary" onClick={openNew}>Новое дело</button>
      </header>

      {warning && <div className="notice" role="alert">{warning}</div>}

      <section className="controls" aria-label="Фильтры">
        <label className="search">
          <span>Поиск по всем делам</span>
          <input
            type="search"
            placeholder="Название, описание, комментарий"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="period-tabs" aria-label="Период">
          {(["day", "week", "month"] as Period[]).map((item) => (
            <button
              key={item}
              className={period === item ? "active" : ""}
              onClick={() => setPeriod(item)}
            >
              {{ day: "День", week: "Неделя", month: "Месяц" }[item]}
            </button>
          ))}
        </div>

        <div className="date-nav">
          <button aria-label="Предыдущий период" onClick={() => shiftCursor(-1)}>←</button>
          <label>
            <span>Выбранная дата</span>
            <input type="date" value={cursor} onChange={(event) => setCursor(event.target.value)} />
          </label>
          <button aria-label="Следующий период" onClick={() => shiftCursor(1)}>→</button>
          <button className="today" onClick={() => setCursor(localDateValue(new Date()))}>Сегодня</button>
        </div>
      </section>

      <section className="matter-section">
        <div className="section-heading">
          <div>
            <p>{query ? "Результаты поиска" : "Срок завершения"}</p>
            <h2>{query ? `«${query.trim()}»` : rangeLabel}</h2>
          </div>
          <span>{visibleMatters.length}</span>
        </div>

        {loading ? (
          <p className="empty">Загрузка…</p>
        ) : visibleMatters.length === 0 ? (
          <div className="empty">
            <strong>{query ? "Ничего не найдено" : "На этот период дел нет"}</strong>
            <span>{query ? "Измените запрос." : "Создайте новое дело или выберите другую дату."}</span>
          </div>
        ) : (
          <div className="matter-list">
            {visibleMatters.map((matter) => {
              const overdue = !matter.closedAt && new Date(matter.dueAt) < new Date();
              return (
                <article key={matter.id} className={matter.closedAt ? "matter closed" : "matter"}>
                  <button onClick={() => openMatter(matter)}>
                    <div className="matter-main">
                      <div className="matter-status">
                        <span className={matter.closedAt ? "badge done" : overdue ? "badge late" : "badge open"}>
                          {matter.closedAt ? "Закрыто" : overdue ? "Просрочено" : "Открыто"}
                        </span>
                        <span className="comments-count">Комментариев: {matter.comments.length}</span>
                      </div>
                      <h3>{matter.title}</h3>
                      {matter.details && <p>{matter.details}</p>}
                    </div>
                    <dl>
                      <div><dt>Обещано</dt><dd>{formatDateTime(matter.promisedAt)}</dd></div>
                      <div><dt>Завершить</dt><dd>{formatDateTime(matter.dueAt)}</dd></div>
                    </dl>
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {editorKey && draft && (
        <div className="editor-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setEditorKey(null);
        }}>
          <aside className="editor" role="dialog" aria-modal="true" aria-labelledby="editor-title">
            <div className="editor-head">
              <div>
                <p>{editorKey === "new" ? "Новое дело" : "Карточка дела"}</p>
                <h2 id="editor-title">{editorKey === "new" ? "Создание" : selectedMatter?.title}</h2>
              </div>
              <button className="icon-button" aria-label="Закрыть карточку" onClick={() => setEditorKey(null)}>×</button>
            </div>

            <form className="editor-form" onSubmit={submitMatter}>
              <label>
                <span>Название *</span>
                <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
              </label>
              <label>
                <span>Описание</span>
                <textarea rows={4} value={draft.details} onChange={(event) => setDraft({ ...draft, details: event.target.value })} />
              </label>
              <div className="date-fields">
                <label>
                  <span>Когда обещано *</span>
                  <input type="datetime-local" value={draft.promisedAt} onChange={(event) => setDraft({ ...draft, promisedAt: event.target.value })} />
                </label>
                <label>
                  <span>Когда завершить *</span>
                  <input type="datetime-local" value={draft.dueAt} onChange={(event) => setDraft({ ...draft, dueAt: event.target.value })} />
                </label>
              </div>
              {error && <p className="form-error" role="alert">{error}</p>}
              <div className="form-actions">
                {selectedMatter && !selectedMatter.closedAt && (
                  <button type="button" className="secondary danger" onClick={() => void persist(true)}>Закрыть дело</button>
                )}
                <button type="submit" className="primary">Сохранить</button>
              </div>
            </form>

            {selectedMatter && (
              <section className="comments">
                <h3>Комментарии</h3>
                <form onSubmit={addComment}>
                  <textarea
                    rows={3}
                    aria-label="Новый комментарий"
                    placeholder="Добавить комментарий"
                    value={comment}
                    onChange={(event) => changeComment(event.target.value)}
                  />
                  <button className="secondary" disabled={!comment.trim()}>Добавить</button>
                </form>
                <div className="comment-list">
                  {[...selectedMatter.comments].reverse().map((item) => (
                    <article key={item.id}>
                      <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
                      <p>{item.text}</p>
                    </article>
                  ))}
                  {selectedMatter.comments.length === 0 && <p className="muted">Комментариев пока нет.</p>}
                </div>
              </section>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
