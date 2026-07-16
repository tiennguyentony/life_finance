import Link from "next/link";

import { BrandMark } from "./brand-mark";

export function AppHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" href="/">
          <BrandMark />
          Life Finance
        </Link>
        <nav aria-label="Primary navigation" className="site-nav">
          <Link className="site-nav-link" href="/play">
            Console
          </Link>
          <Link className="nav-cta" href="/game">
            Play the game
          </Link>
        </nav>
      </div>
    </header>
  );
}
