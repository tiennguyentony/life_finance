import type { Metadata } from "next";
import { Baloo_2 } from "next/font/google";

import { AppHeader } from "@/components/app-header";
import { BrandMark } from "@/components/brand-mark";

import "./globals.css";

const displayFont = Baloo_2({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Life Finance",
    template: "%s | Life Finance",
  },
  description: "A deterministic financial life simulation.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html className={displayFont.variable} lang="en">
      <body>
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <AppHeader />
        <main className="page-shell" id="main-content">
          {children}
        </main>
        <footer className="site-footer">
          <div className="footer-brand">
            <BrandMark size={18} />
            Life Finance
          </div>
          <div>Every consequence comes from the engine, with receipts.</div>
        </footer>
      </body>
    </html>
  );
}
