"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AppHeader() {
  const pathname = usePathname();

  if (pathname === "/" || pathname.startsWith("/board")) {
    return null;
  }

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" href="/">
          <span className="brand-seed" aria-hidden="true" />
          <strong>LIFE FINANCE</strong>
          <small>play your money</small>
        </Link>
        <nav aria-label="Game navigation" className="site-nav">
          {pathname !== "/start" ? (
            <Link className="nav-pill" href="/start">
              New game
            </Link>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
