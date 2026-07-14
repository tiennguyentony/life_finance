import type { Metadata } from "next";

import { AppHeader } from "@/components/app-header";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Life Finance",
    template: "%s | Life Finance",
  },
  description: "A browser-first financial life simulation repository shell.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <AppHeader />
        <main className="page-shell" id="main-content">
          {children}
        </main>
        <footer className="site-footer">
          <div>Life Finance</div>
          <div>Localhost repository shell</div>
        </footer>
      </body>
    </html>
  );
}
