export type MatterComment = {
  id: string;
  text: string;
  createdAt: string;
};

export type Matter = {
  version: 1;
  id: string;
  title: string;
  details: string;
  promisedAt: string;
  dueAt: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  comments: MatterComment[];
};

export type MatterDraft = Pick<Matter, "title" | "details" | "promisedAt" | "dueAt">;

const DB_NAME = "promise-diary";
const STORE_NAME = "matters";
const DRAFT_PREFIX = "promise-diary:draft:";

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isComment = (value: unknown): value is MatterComment =>
  isObject(value) &&
  typeof value.id === "string" &&
  typeof value.text === "string" &&
  typeof value.createdAt === "string";

const isMatter = (value: unknown): value is Matter =>
  isObject(value) &&
  value.version === 1 &&
  typeof value.id === "string" &&
  typeof value.title === "string" &&
  typeof value.details === "string" &&
  typeof value.promisedAt === "string" &&
  typeof value.dueAt === "string" &&
  (typeof value.closedAt === "string" || value.closedAt === null) &&
  typeof value.createdAt === "string" &&
  typeof value.updatedAt === "string" &&
  Array.isArray(value.comments) &&
  value.comments.every(isComment);

const openDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

export const loadMatters = async () => {
  const database = await openDatabase();
  return new Promise<{ matters: Matter[]; skipped: number }>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      const matters = request.result.filter(isMatter);
      resolve({ matters, skipped: request.result.length - matters.length });
      database.close();
    };
    request.onerror = () => {
      reject(request.error);
      database.close();
    };
  });
};

export const saveMatter = async (matter: Matter) => {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(matter);
    transaction.oncomplete = () => {
      resolve();
      database.close();
    };
    transaction.onerror = () => {
      reject(transaction.error);
      database.close();
    };
  });
};

const isDraft = (value: unknown): value is MatterDraft =>
  isObject(value) &&
  typeof value.title === "string" &&
  typeof value.details === "string" &&
  typeof value.promisedAt === "string" &&
  typeof value.dueAt === "string";

export const loadDraft = (key: string) => {
  try {
    const raw = localStorage.getItem(`${DRAFT_PREFIX}${key}`);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return isDraft(value) ? value : null;
  } catch {
    return null;
  }
};

export const saveDraft = (key: string, draft: MatterDraft) => {
  try {
    localStorage.setItem(`${DRAFT_PREFIX}${key}`, JSON.stringify(draft));
  } catch {
    // The current in-memory form still keeps the input if storage is unavailable.
  }
};

export const clearDraft = (key: string) => {
  try {
    localStorage.removeItem(`${DRAFT_PREFIX}${key}`);
  } catch {
    // No action is required when browser storage is unavailable.
  }
};
