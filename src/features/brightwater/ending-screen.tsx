"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";

import { formatMoney } from "./format";
import { DECISIONS, enumerateScenarios, TOTAL_MONTHS, type RunResult } from "./model";
import { MASCOT, PLAYER } from "./persona-art";

const GRADE_COPY: Record<string, { title: string; line: string }> = {
  gold: {
    title: "Brightwater belongs to you",
    line: "Fifteen months, five calls, and a cushion most first years never see.",
  },
  silver: {
    title: "You made the city work",
    line: "Steady hands, honest tradeoffs, money left over. That is the whole game.",
  },
  bronze: {
    title: "You survived the year",
    line: "It got close. But the account stayed above zero, and that counts.",
  },
};

export function EndingScreen({
  run,
  onRestart,
}: Readonly<{ run: RunResult; onRestart: () => void }>) {
  const survived = run.outcome === "survived";

  const ranking = useMemo(() => {
    const scenarios = [...enumerateScenarios()].sort((a, b) => {
      if (a.outcome !== b.outcome) return a.outcome === "survived" ? -1 : 1;
      if (a.outcome === "survived") return b.netWorth - a.netWorth;
      return b.endedAtMonth - a.endedAtMonth;
    });
    const key = run.choices.join("");
    const index = scenarios.findIndex((scenario) =>
      scenario.choices.join("").startsWith(key),
    );
    const bankruptCount = scenarios.filter(
      ({ outcome }) => outcome === "bankrupt",
    ).length;
    return { rank: index + 1, total: scenarios.length, bankruptCount };
  }, [run.choices]);

  const grade = run.grade ? GRADE_COPY[run.grade]! : null;
  const portrait = survived ? MASCOT : PLAYER;

  return (
    <div aria-labelledby="ending-title" className="modal-backdrop" role="dialog">
      <article
        className="modal-panel"
        style={{ maxWidth: 560, textAlign: "center", display: "grid", justifyItems: "center" }}
      >
        <Image
          alt={portrait.alt}
          className="bw-ending-portrait"
          height={portrait.height}
          sizes="108px"
          src={portrait.src}
          width={portrait.width}
        />
        {survived && run.grade ? (
          <p style={{ marginTop: "1rem" }}>
            {run.grade === "gold" ? "Gold" : run.grade === "silver" ? "Silver" : "Bronze"}{" "}
            year
          </p>
        ) : (
          <p style={{ marginTop: "1rem", background: "var(--coral)" }}>
            Bankrupt in month {run.endedAtMonth}
          </p>
        )}
        <h2 id="ending-title">{survived ? grade!.title : "Brightwater broke the bank"}</h2>
        <p className="event-description" style={{ maxWidth: "44ch" }}>
          {survived
            ? grade!.line
            : "Cash went below zero, and in this city that is the whole ballgame. Next run, the math is yours to bend."}
        </p>

        <div className="bw-ending-stats">
          <div>
            <span>{survived ? "Final net worth" : "Months survived"}</span>
            <strong>
              {survived
                ? formatMoney(run.netWorth)
                : `${run.endedAtMonth} of ${TOTAL_MONTHS}`}
            </strong>
          </div>
          <div>
            <span>Cash</span>
            <strong>{formatMoney(run.finalCash)}</strong>
          </div>
          <div>
            <span>Invested</span>
            <strong>{formatMoney(run.invested)}</strong>
          </div>
        </div>

        <p className="event-description" style={{ fontSize: "0.85rem" }}>
          Of the {ranking.total} possible futures in this run, {ranking.bankruptCount}{" "}
          end in bankruptcy. Yours ranked <strong>#{ranking.rank}</strong>.
        </p>

        <ol style={{ display: "grid", width: "100%", margin: 0, padding: 0, listStyle: "none" }}>
          {run.choices.map((choiceId, index) => {
            const decision = DECISIONS[index]!;
            const option = decision.options.find(({ id }) => id === choiceId)!;
            return (
              <li
                key={decision.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  padding: "0.5rem 0",
                  borderTop: "2px solid var(--line)",
                  fontSize: "0.85rem",
                }}
              >
                <span style={{ color: "var(--muted)" }}>{decision.title}</span>
                <strong>{option.label}</strong>
              </li>
            );
          })}
        </ol>

        <div style={{ display: "flex", gap: "0.6rem", marginTop: "1rem" }}>
          <button className="button button-primary button-large" onClick={onRestart} type="button">
            Run it back
          </button>
          <Link className="button button-secondary button-large" href="/game/brightwater">
            Back to title
          </Link>
        </div>
      </article>
    </div>
  );
}
