"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";

import { CHARACTERS, MASCOT } from "@/features/play/persona-art";
import { formatMoney } from "@/features/play/play-model";

import {
  DECISIONS,
  enumerateScenarios,
  TOTAL_MONTHS,
  type RunResult,
} from "./model";

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
    /* Early bankruptcies carry fewer than five choices; every full scenario
     * sharing that prefix ends the same way, so rank by prefix. */
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

  return (
    <div
      aria-labelledby="ending-title"
      className={`game-overlay ending-overlay ${survived ? "is-win" : "is-loss"}`}
      role="dialog"
    >
      <article className="game-card ending-card">
        <Image
          alt={survived ? MASCOT.alt : CHARACTERS.buddi.alt}
          className="ending-portrait"
          height={(survived ? MASCOT : CHARACTERS.buddi).height}
          sizes="108px"
          src={(survived ? MASCOT : CHARACTERS.buddi).src}
          width={(survived ? MASCOT : CHARACTERS.buddi).width}
        />
        {survived && run.grade ? (
          <span className={`chip grade-chip grade-${run.grade}`}>
            {run.grade === "gold" ? "Gold" : run.grade === "silver" ? "Silver" : "Bronze"} year
          </span>
        ) : (
          <span className="chip chip-danger grade-chip">
            Bankrupt in month {run.endedAtMonth}
          </span>
        )}
        <h2 id="ending-title">
          {survived ? grade!.title : "Brightwater broke the bank"}
        </h2>
        <p className="ending-line">
          {survived
            ? grade!.line
            : "Cash went below zero, and in this city that is the whole ballgame. Next run, the math is yours to bend."}
        </p>

        <div className="ending-stats">
          <div>
            <span>{survived ? "Final net worth" : "Months survived"}</span>
            <strong className="tnum">
              {survived
                ? formatMoney(run.netWorth * 100)
                : `${run.endedAtMonth} of ${TOTAL_MONTHS}`}
            </strong>
          </div>
          <div>
            <span>Cash</span>
            <strong className="tnum">{formatMoney(run.finalCash * 100)}</strong>
          </div>
          <div>
            <span>Invested</span>
            <strong className="tnum">{formatMoney(run.invested * 100)}</strong>
          </div>
        </div>

        <p className="ending-rank">
          Of the {ranking.total} possible futures in this run,{" "}
          {ranking.bankruptCount} end in bankruptcy. Yours ranked{" "}
          <strong>#{ranking.rank}</strong>.
        </p>

        <ol className="ending-recap">
          {run.choices.map((choiceId, index) => {
            const decision = DECISIONS[index]!;
            const option = decision.options.find(({ id }) => id === choiceId)!;
            return (
              <li key={decision.id}>
                <span>{decision.title}</span>
                <strong>{option.label}</strong>
              </li>
            );
          })}
        </ol>

        <div className="game-card-actions">
          <button
            autoFocus
            className="btn btn-primary btn-lg"
            onClick={onRestart}
            type="button"
          >
            Run it back
          </button>
          <Link className="btn btn-quiet btn-lg" href="/game">
            Back to title
          </Link>
        </div>
      </article>
    </div>
  );
}
