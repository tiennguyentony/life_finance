import type { Metadata } from "next";

import { AppHeader } from "@/components/app-header";
import { GameProvider } from "@/components/game-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Life Finance",
    template: "%s | Life Finance",
  },
  description: "A playful financial life simulation game starring Sprout.",
  icons: { icon: "data:," },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html data-scroll-behavior="smooth" lang="en">
      <body>
        <GameProvider>
          <a className="skip-link" href="#main-content">
            Skip to content
          </a>
          <AppHeader />
          <main className="page-shell" id="main-content">
            {children}
          </main>
          <footer className="site-footer">
            <div>Life Finance</div>
            <div>Developer play interface</div>
          </footer>
        </GameProvider>
      </body>
    </html>
  );
}
