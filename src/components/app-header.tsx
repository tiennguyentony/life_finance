import Link from "next/link";

import { CUJS } from "@/core/cuj";

export function AppHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" href="/">
          Life Finance
        </Link>
        <nav aria-label="Critical user journeys" className="site-nav">
          {CUJS.map((journey) => (
            <Link href={journey.href} key={journey.slug}>
              {journey.navLabel}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
