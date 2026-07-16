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
          <Link className="nav-cta" href="/play">
            Play
          </Link>
        </nav>
      </div>
    </header>
  );
}
