import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Brightwater City",
  description:
    "A financial life game: fifteen months, five decisions, one new grad.",
};

export default function BrightwaterTitlePage() {
  return (
    <section className="selection-screen" style={{ minHeight: "calc(100dvh - 156px)" }}>
      <div className="screen-heading">
        <p>Life Finance presents</p>
        <h1>Brightwater City</h1>
        <span>
          Fresh diploma. Big city. Fifteen months of rent, rides, surprises, and one
          bonus check. Five decisions stand between you and a life that pays for
          itself.
        </span>
      </div>
      <div style={{ display: "grid", justifyItems: "center", gap: "1.4rem", marginTop: "2.5rem" }}>
        <Link className="button button-primary button-large" href="/game/brightwater/play">
          Play
        </Link>
        <div className="bw-chip-row">
          <span className="bw-chip">5 decisions</span>
          <span className="bw-chip">3 options each</span>
          <span className="bw-chip">243 possible futures</span>
        </div>
      </div>
    </section>
  );
}
