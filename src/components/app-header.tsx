"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useGame } from "./game-provider";

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { machine, resetGame } = useGame();
  const inBrightwater = pathname.startsWith("/game/brightwater");
  const inBoard = pathname.startsWith("/board");
  const inGame = pathname.startsWith("/game") && !inBrightwater;

  /* Brightwater City and the board are self-contained games with their own
   * full-screen HUDs; they render no shared chrome, same as the landing page. */
  if (pathname === "/" || inBrightwater || inBoard) {
    return null;
  }

  function handleReset() {
    resetGame();
    router.push("/start");
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
          {machine && !inGame ? <Link href="/game">Resume life</Link> : null}
          {inGame ? <button onClick={handleReset} type="button">Start over</button> : null}
          {!inGame && pathname !== "/start" ? <Link className="nav-pill" href="/start">New game</Link> : null}
        </nav>
      </div>
    </header>
  );
}
