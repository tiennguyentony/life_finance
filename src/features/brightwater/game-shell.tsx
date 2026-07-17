"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useMemo, useReducer, useState } from "react";

import { AllocationPanel } from "./allocation-panel";
import { CashflowSheet } from "./cashflow-sheet";
import { DecisionModal } from "./decision-modal";
import { EndingScreen } from "./ending-screen";
import { formatMoney } from "./format";
import { GameHud } from "./hud";
import { locationById } from "./locations";
import {
  DECISIONS,
  INITIAL_ALLOCATION,
  simulateRun,
  type Allocation,
  type AllocationChange,
  type ChoiceId,
  type MoneyMove,
} from "./model";
import { MASCOT, PLAYER } from "./persona-art";
import { TickOverlay } from "./tick-overlay";

const CityScene = dynamic(() => import("./city-scene"), {
  ssr: false,
  loading: () => (
    <div className="bw-loading" role="status">
      Building Brightwater City...
    </div>
  ),
});

type Phase = "intro" | "explore" | "decision" | "tick" | "ending";

type GameState = Readonly<{
  phase: Phase;
  choices: readonly ChoiceId[];
  shownMonths: number;
  allocationTimeline: readonly AllocationChange[];
  moves: readonly MoneyMove[];
  bankOpen: boolean;
  cashflowOpen: boolean;
}>;

type GameAction =
  | { type: "start" }
  | { type: "open-decision" }
  | { type: "choose"; choiceId: ChoiceId }
  | { type: "tick-done"; revealedMonths: number; finished: boolean }
  | { type: "set-bank"; open: boolean }
  | { type: "set-cashflow"; open: boolean }
  | { type: "set-allocation"; allocation: Allocation; month: number }
  | { type: "move-money"; move: MoneyMove }
  | { type: "restart" };

const INITIAL_STATE: GameState = {
  phase: "intro",
  choices: [],
  shownMonths: 0,
  allocationTimeline: [{ month: 0, allocation: INITIAL_ALLOCATION }],
  moves: [],
  bankOpen: false,
  cashflowOpen: false,
};

function reducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case "start":
      return { ...state, phase: "explore" };
    case "open-decision":
      return { ...state, phase: "decision", bankOpen: false, cashflowOpen: false };
    case "choose":
      return { ...state, phase: "tick", choices: [...state.choices, action.choiceId] };
    case "tick-done":
      return {
        ...state,
        shownMonths: action.revealedMonths,
        phase: action.finished ? "ending" : "explore",
      };
    case "set-bank":
      return { ...state, bankOpen: action.open };
    case "set-cashflow":
      return { ...state, cashflowOpen: action.open };
    case "set-allocation": {
      const kept = state.allocationTimeline.filter(
        (change) => change.month !== action.month,
      );
      return {
        ...state,
        allocationTimeline: [...kept, { month: action.month, allocation: action.allocation }],
      };
    }
    case "move-money":
      return { ...state, moves: [...state.moves, action.move] };
    case "restart":
      return INITIAL_STATE;
  }
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function GameShell() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const reducedMotion = useReducedMotion();

  const run = useMemo(
    () =>
      simulateRun(state.choices, {
        allocationTimeline: state.allocationTimeline,
        moves: state.moves,
      }),
    [state.choices, state.allocationTimeline, state.moves],
  );

  const chapter = state.choices.length;
  const currentDecision = chapter < DECISIONS.length ? DECISIONS[chapter]! : null;
  const activeLocationId =
    state.phase === "explore" && currentDecision ? currentDecision.locationId : null;
  const visitedIds = DECISIONS.slice(0, chapter).map(({ locationId }) => locationId);
  const shownMonth = state.shownMonths;
  const visibleMonths = run.months.slice(0, shownMonth);
  const latestShown = visibleMonths.at(-1) ?? null;
  const displayCash = latestShown?.cash ?? run.finalCash;
  const displayInvested = latestShown?.invested ?? run.invested;
  const overlayOpen = state.phase !== "explore" || state.bankOpen || state.cashflowOpen;

  const currentAllocation = useMemo(() => {
    let allocation = INITIAL_ALLOCATION;
    for (const change of [...state.allocationTimeline].sort((a, b) => a.month - b.month)) {
      if (change.month <= shownMonth + 1) allocation = change.allocation;
    }
    return allocation;
  }, [state.allocationTimeline, shownMonth]);

  const interactiveIds = useMemo(() => {
    if (state.phase !== "explore") return [];
    const ids = ["bank"];
    if (activeLocationId && !ids.includes(activeLocationId)) ids.push(activeLocationId);
    return ids;
  }, [state.phase, activeLocationId]);

  const handleSelect = (locationId: string) => {
    if (state.phase !== "explore") return;
    if (currentDecision && locationId === currentDecision.locationId) {
      dispatch({ type: "open-decision" });
      return;
    }
    if (locationId === "bank") dispatch({ type: "set-bank", open: true });
  };

  return (
    <div className="bw-stage">
      <div aria-hidden={overlayOpen} className="bw-canvas">
        <CityScene
          activeLocationId={activeLocationId}
          interactiveIds={interactiveIds}
          onSelect={handleSelect}
          paused={overlayOpen}
          reducedMotion={reducedMotion}
          visitedIds={visitedIds}
        />
      </div>

      <GameHud
        cash={displayCash}
        chapter={chapter}
        invested={displayInvested}
        month={shownMonth}
        monthlyNet={run.monthlyNet}
        objective={
          state.phase === "explore" && currentDecision
            ? `Head to ${locationById(currentDecision.locationId).name}`
            : null
        }
        onOpenBank={() => dispatch({ type: "set-bank", open: true })}
        onOpenCashflow={() => dispatch({ type: "set-cashflow", open: true })}
        onRestart={() => dispatch({ type: "restart" })}
        showControls={state.phase === "explore"}
      />

      {state.phase === "intro" ? (
        <div aria-labelledby="intro-title" className="modal-backdrop" role="dialog">
          <article
            className="modal-panel"
            style={{ maxWidth: 560, display: "grid", justifyItems: "start", gap: "1rem" }}
          >
            <Image
              alt={PLAYER.alt}
              className="bw-intro-portrait"
              height={PLAYER.height}
              sizes="96px"
              src={PLAYER.src}
              width={PLAYER.width}
            />
            <h2 id="intro-title">Fresh diploma, big city.</h2>
            <p className="event-description">
              You are Buddi: first real job, {formatMoney(5_000)} in savings, and
              fifteen months of Brightwater City ahead. Five decisions decide whether
              you make it.
            </p>
            <ul className="bw-rules">
              <li>Take-home pay lands every month; life takes its cut.</li>
              <li>If your cash dips below zero, the run ends. That is the rule.</li>
              <li>Sprout Bank can invest whatever you manage to keep.</li>
            </ul>
            <button
              autoFocus
              className="button button-primary button-large"
              onClick={() => dispatch({ type: "start" })}
              type="button"
            >
              Step off the train
            </button>
          </article>
        </div>
      ) : null}

      {state.phase === "decision" && currentDecision ? (
        <DecisionModal
          cash={displayCash}
          decision={currentDecision}
          onChoose={(choiceId) => dispatch({ type: "choose", choiceId })}
        />
      ) : null}

      {state.phase === "tick" ? (
        <TickOverlay
          chapter={chapter}
          onDone={() =>
            dispatch({
              type: "tick-done",
              revealedMonths: run.months.length,
              finished: run.outcome !== "playing",
            })
          }
          previouslyShown={shownMonth}
          reducedMotion={reducedMotion}
          run={run}
        />
      ) : null}

      {state.phase === "ending" ? (
        <EndingScreen onRestart={() => dispatch({ type: "restart" })} run={run} />
      ) : null}

      {state.bankOpen ? (
        <AllocationPanel
          allocation={currentAllocation}
          cash={displayCash}
          invested={displayInvested}
          onAllocate={(allocation) =>
            dispatch({ type: "set-allocation", allocation, month: shownMonth + 1 })
          }
          onClose={() => dispatch({ type: "set-bank", open: false })}
          onMove={(amount) =>
            dispatch({
              type: "move-money",
              move: { month: Math.max(1, shownMonth), toInvested: amount },
            })
          }
        />
      ) : null}

      {state.cashflowOpen ? (
        <CashflowSheet
          choices={state.choices}
          monthlyNet={run.monthlyNet}
          onClose={() => dispatch({ type: "set-cashflow", open: false })}
        />
      ) : null}

      {state.phase === "explore" ? (
        <p className="bw-guide">
          <Image
            alt=""
            className="bw-guide-portrait"
            height={MASCOT.height}
            sizes="38px"
            src={MASCOT.src}
            width={MASCOT.width}
          />
          <span>
            {chapter === 0
              ? "Drag to look around. The green beacon marks your next decision."
              : "Sprout Bank is always open if you want your money working."}
          </span>
        </p>
      ) : null}
    </div>
  );
}
