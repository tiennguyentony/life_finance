import Link from "next/link";

export function AppHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" href="/">
          Life Finance
        </Link>
        <nav aria-label="Primary navigation" className="site-nav">
          <Link href="/play">Play simulation</Link>
        </nav>
      </div>
    </header>
  );
}
