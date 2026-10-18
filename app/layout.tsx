import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Дневник обещаний",
  description: "Локальный журнал дел, сроков и комментариев.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
