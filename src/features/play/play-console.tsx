"use client";

import { useEffect, useMemo, useState } from "react";

import type { GameStateV2 } from "@/core/game-state-v2";
import { getEventTemplate } from "@/data/event-templates";
import { US_2026_SCENARIO_CATALOG } from "@/data/scenario-catalog";
import {
  EDUCATION_CONCEPTS,
  EDUCATION_CONTENT_VERSION,
  getEducationConcept,
} from "@/data/education-content";
import type {
  CheckpointV2Response,
  CommandV2Response,
  GameCommandV2Public,
} from "@/server/api/contracts-v2";

import {
  buildCreateRequest,
  calculateAgeYears,
  calculateFinancialIndependence,
  calculateNetWorth,
  dollarsToCents,
  formatMoney,
  percentToPpm,
  PLAYER_PRESETS,
  type PlayerPresetId,
} from "./play-model";

const SESSION_KEY = "life-finance.developer-run.v1";

type RunCredential = Readonly<{ runId: string; accessSecret: string }>;
type RunResponse = Readonly<{ state: GameStateV2; stateChecksum: string }>;
type MonthlyRecap = NonNullable<CommandV2Response["monthlyRecord"]>;
type DetailedAction = Extract<
  GameCommandV2Public,
  { type: "take_detailed_action" }
>["payload"]["action"];
type PlayTab = "overview" | "strategy" | "actions" | "learn";

const ACTION_GUIDANCE: Record<string, { summary: string; conceptId: string }> = {
  invest_taxable: {
    summary: "Move liquid cash into a diversified but volatile market asset.",
    conceptId: "broad_index",
  },
  invest_sector: {
    summary: "Concentrate in one sector for higher upside and higher correlated risk.",
    conceptId: "sector_investing",
  },
  invest_speculative: {
    summary: "Take a high-volatility position that can amplify gains or losses.",
    conceptId: "speculation",
  },
  liquidate_taxable: {
    summary: "Restore liquidity by selling investments and paying a modeled 1% cost.",
    conceptId: "liquidity",
  },
  contribute_ira: {
    summary: "Move cash into an individually owned retirement account.",
    conceptId: "ira",
  },
  contribute_hsa: {
    summary: "Move cash into the selected plan's tax-advantaged medical account.",
    conceptId: "hsa",
  },
  pay_term_debt: {
    summary: "Reduce principal and future interest, at the cost of cash today.",
    conceptId: "dti",
  },
  pay_revolving_credit: {
    summary: "Lower credit utilization and financial exposure.",
    conceptId: "exposure",
  },
  draw_revolving_credit: {
    summary: "Add cash now by increasing high-risk revolving debt.",
    conceptId: "liquidity",
  },
  withdraw_401k: {
    summary: "Access retirement value early with 20% withholding and a 10% penalty.",
    conceptId: "401k",
  },
  withdraw_ira: {
    summary: "Access IRA value early with 20% withholding and a 10% penalty.",
    conceptId: "ira",
  },
  purchase_home: {
    summary: "Use cash for down payment and 3% closing costs, then add mortgage debt.",
    conceptId: "liquidity",
  },
  sell_home: {
    summary: "Liquidate the home, repay its mortgage, and pay a modeled 6% sale cost.",
    conceptId: "liquidity",
  },
  refinance_home: {
    summary: "Replace the mortgage rate and term while paying a modeled 2% cost.",
    conceptId: "dti",
  },
  reduce_lifestyle: {
    summary: "Lower recurring annual burn and bring the FI finish line closer.",
    conceptId: "lifestyle_creep",
  },
  increase_lifestyle: {
    summary: "Spend more each year now while moving the FI finish line farther away.",
    conceptId: "lifestyle_creep",
  },
  start_upskill: {
    summary: "Pay an education cost now for a delayed, cataloged salary increase.",
    conceptId: "compounding",
  },
};

function commandId(kind: string): string {
  return `ui.${kind}.${crypto.randomUUID()}`;
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const apiError = body as { error?: { code?: string; message?: string } } | null;
    throw new Error(
      `${apiError?.error?.code ?? `HTTP_${response.status}`}: ${apiError?.error?.message ?? "Request failed"}`,
    );
  }
  return body as T;
}

function authHeaders(secret: string): HeadersInit {
  return { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };
}

function formatRate(ppm: number | null): string {
  return ppm === null ? "Unknown" : `${(ppm / 10_000).toFixed(1)}%`;
}

function formatRunway(ppm: number): string {
  return `${(ppm / 1_000_000).toFixed(1)} months`;
}

function formatOutflow(cents: number): string {
  if (cents === 0) return formatMoney(0);
  return cents > 0 ? `−${formatMoney(cents)}` : `+${formatMoney(-cents)}`;
}

function titleFromId(id: string): string {
  return id.split(".").at(-1)!.replaceAll("_", " ");
}

function ConceptButton({
  conceptId,
  onSelect,
}: Readonly<{ conceptId: string; onSelect: (id: string) => void }>) {
  const concept = getEducationConcept(conceptId);
  if (!concept) return null;
  return (
    <button
      aria-label={`Learn about ${concept.title}`}
      className="concept-button"
      onClick={() => onSelect(conceptId)}
      title={`Learn about ${concept.title}`}
      type="button"
    >
      ?
    </button>
  );
}

export function PlayConsole() {
  const [credential, setCredential] = useState<RunCredential | null>(null);
  const [state, setState] = useState<GameStateV2 | null>(null);
  const [presetId, setPresetId] = useState<PlayerPresetId>("software");
  const [salary, setSalary] = useState(120_000);
  const [cash, setCash] = useState(25_000);
  const [studentDebt, setStudentDebt] = useState(15_000);
  const [studentDebtPayment, setStudentDebtPayment] = useState(250);
  const [healthPlanId, setHealthPlanId] = useState("health.hdhp_hsa");
  const [coverageIds, setCoverageIds] = useState<string[]>(["insurance.renters"]);
  const [strategy, setStrategy] = useState({
    retirement: 5,
    hsa: 1,
    index: 5,
    sector: 0,
    speculative: 0,
    ira: 0,
    debt: 0,
  });
  const [action, setAction] = useState("invest_taxable");
  const [actionAmount, setActionAmount] = useState(500);
  const [secondaryAmount, setSecondaryAmount] = useState(20_000);
  const [mortgageRate, setMortgageRate] = useState(6.5);
  const [mortgageTerm, setMortgageTerm] = useState(360);
  const [upskillProgram, setUpskillProgram] = useState<
    "upskill.certificate" | "upskill.bootcamp" | "upskill.degree"
  >("upskill.certificate");
  const [checkpoint, setCheckpoint] = useState<CheckpointV2Response | null>(null);
  const [turnHistory, setTurnHistory] = useState<MonthlyRecap[]>([]);
  const [activeConceptId, setActiveConceptId] = useState("financial_independence");
  const [tab, setTab] = useState<PlayTab>("overview");
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<string[]>([]);

  const addActivity = (message: string) => {
    setActivity((current) => [message, ...current].slice(0, 20));
  };

  const selectConcept = (conceptId: string) => {
    setActiveConceptId(conceptId);
    setTab("learn");
  };

  useEffect(() => {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    let cancelled = false;
    try {
      const saved = JSON.parse(raw) as RunCredential;
      void apiRequest<RunResponse>(`/api/v2/runs/${saved.runId}`, {
        headers: authHeaders(saved.accessSecret),
      })
        .then((result) => {
          if (cancelled) return;
          setCredential(saved);
          setState(result.state);
        })
        .catch(() => sessionStorage.removeItem(SESSION_KEY));
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const createGame = async () => {
    setBusy(true);
    setBusyLabel("Creating your balance sheet…");
    setError(null);
    try {
      const request = buildCreateRequest(
        presetId,
        salary,
        cash,
        `browser-${crypto.randomUUID()}`,
        studentDebt,
        studentDebtPayment,
        healthPlanId,
        coverageIds,
      );
      const result = await apiRequest<RunResponse & RunCredential>("/api/v2/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const saved = { runId: result.runId, accessSecret: result.accessSecret };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(saved));
      setCredential(saved);
      setState(result.state);
      setCheckpoint(null);
      setTurnHistory([]);
      setActivity([`Created ${PLAYER_PRESETS[presetId].label} run.`]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create game");
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  };

  const submit = async (command: GameCommandV2Public, message: string) => {
    if (!credential) return;
    setBusy(true);
    setBusyLabel("Applying your decision…");
    setError(null);
    try {
      const result = await apiRequest<CommandV2Response>(
        `/api/v2/runs/${credential.runId}/commands`,
        {
          method: "POST",
          headers: authHeaders(credential.accessSecret),
          body: JSON.stringify(command),
        },
      );
      setState(result.state);
      setCheckpoint(null);
      addActivity(message);
      if (result.monthlyRecord) {
        setTurnHistory((current) => [result.monthlyRecord!, ...current].slice(0, 12));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Command failed");
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  };

  const saveStrategy = () => {
    if (!state) return;
    void submit(
      {
        schemaVersion: 2,
        id: commandId("strategy"),
        expectedRevision: state.revision,
        effectiveMonth: state.currentMonth,
        type: "set_recurring_strategy",
        payload: {
          strategy: {
            preTax401kSalaryRatePpm: percentToPpm(strategy.retirement),
            preTaxHsaSalaryRatePpm: percentToPpm(
              state.gameplay.benefits.hsaEligible === true ? strategy.hsa : 0,
            ),
            afterTaxBroadIndexRatePpm: percentToPpm(strategy.index),
            afterTaxSectorRatePpm: percentToPpm(strategy.sector),
            afterTaxSpeculativeRatePpm: percentToPpm(strategy.speculative),
            afterTaxIraRatePpm: percentToPpm(strategy.ira),
            afterTaxExtraDebtRatePpm: percentToPpm(strategy.debt),
          },
        },
      },
      "Recurring strategy updated.",
    );
  };

  const runMonths = async (count: number) => {
    if (!state || !credential) return;
    setBusy(true);
    setError(null);
    let working = state;
    const recaps: MonthlyRecap[] = [];
    try {
      for (let index = 0; index < count; index += 1) {
        if (working.outcome || working.gameplay.eventLifecycle.pending) break;
        setBusyLabel(`Simulating ${working.currentMonth} · ${index + 1}/${count}…`);
        const result = await apiRequest<CommandV2Response>(
          `/api/v2/runs/${credential.runId}/commands`,
          {
            method: "POST",
            headers: authHeaders(credential.accessSecret),
            body: JSON.stringify({
              schemaVersion: 2,
              id: commandId("month"),
              expectedRevision: working.revision,
              effectiveMonth: working.currentMonth,
              type: "process_month",
              payload: {},
            }),
          },
        );
        working = result.state;
        if (result.monthlyRecord) recaps.unshift(result.monthlyRecord);
      }
      setState(working);
      setCheckpoint(null);
      setTurnHistory((current) => [...recaps, ...current].slice(0, 12));
      addActivity(
        `Processed ${recaps.length} month${recaps.length === 1 ? "" : "s"}; now ${working.currentMonth}.`,
      );
      if (working.gameplay.eventLifecycle.pending) {
        addActivity("Progress paused for a required personal decision.");
      }
    } catch (caught) {
      setState(working);
      setTurnHistory((current) => [...recaps, ...current].slice(0, 12));
      setError(caught instanceof Error ? caught.message : "Monthly simulation failed");
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  };

  const buildSelectedAction = (): DetailedAction => {
    const amountCents = dollarsToCents(actionAmount);
    const debtId = state?.gameplay.debts.termDebts.find(
      ({ principalCents }) => principalCents > 0,
    )?.id;
    switch (action) {
      case "invest_taxable":
        return { type: "invest_taxable", bucket: "taxableBroadIndexCents", amountCents };
      case "invest_sector":
        return { type: "invest_taxable", bucket: "taxableSectorCents", amountCents };
      case "invest_speculative":
        return { type: "invest_taxable", bucket: "taxableSpeculativeCents", amountCents };
      case "liquidate_taxable":
        return {
          type: "liquidate_taxable",
          bucket: "taxableBroadIndexCents",
          amountCents,
          liquidationCostRatePpm: 10_000,
        };
      case "contribute_ira":
        return { type: "contribute_ira", amountCents };
      case "contribute_hsa":
        return { type: "contribute_hsa", amountCents };
      case "pay_term_debt":
        return { type: "pay_term_debt", debtId: debtId ?? "debt.none", amountCents };
      case "pay_revolving_credit":
        return { type: "pay_revolving_credit", amountCents };
      case "draw_revolving_credit":
        return { type: "draw_revolving_credit", amountCents };
      case "withdraw_401k":
        return { type: "withdraw_retirement", bucket: "retirement401kCents", amountCents };
      case "withdraw_ira":
        return { type: "withdraw_retirement", bucket: "retirementIraCents", amountCents };
      case "purchase_home":
        return {
          type: "purchase_home",
          purchasePriceCents: amountCents,
          downPaymentCents: dollarsToCents(secondaryAmount),
          mortgageAnnualInterestRatePpm: percentToPpm(mortgageRate),
          mortgageTermMonths: mortgageTerm,
        };
      case "sell_home":
        return { type: "sell_home" };
      case "refinance_home":
        return {
          type: "refinance_home",
          mortgageAnnualInterestRatePpm: percentToPpm(mortgageRate),
          mortgageTermMonths: mortgageTerm,
        };
      case "reduce_lifestyle":
        return { type: "change_lifestyle", annualLivingCostDeltaCents: -amountCents };
      case "increase_lifestyle":
        return { type: "change_lifestyle", annualLivingCostDeltaCents: amountCents };
      default:
        return { type: "start_upskill", programId: upskillProgram };
    }
  };

  const takeAction = () => {
    if (!state) return;
    void submit(
      {
        schemaVersion: 2,
        id: commandId("action"),
        expectedRevision: state.revision,
        effectiveMonth: state.currentMonth,
        type: "take_detailed_action",
        payload: { action: buildSelectedAction() },
      },
      `Action accepted: ${action.replaceAll("_", " ")}.`,
    );
  };

  const resolveChoice = (choiceId: string) => {
    const pending = state?.gameplay.eventLifecycle.pending;
    if (!state || !pending) return;
    void submit(
      {
        schemaVersion: 2,
        id: commandId("event"),
        expectedRevision: state.revision,
        effectiveMonth: state.currentMonth,
        type: "resolve_event_choice",
        payload: { eventId: pending.eventId, choiceId },
      },
      `Event choice accepted: ${choiceId.replaceAll("_", " ")}.`,
    );
  };

  const loadCheckpoint = async () => {
    if (!state || !credential) return;
    setBusy(true);
    setBusyLabel("Reconciling checkpoint evidence…");
    setError(null);
    try {
      const fromRevision = Math.max(0, state.revision - 12);
      const result = await apiRequest<CheckpointV2Response>(
        `/api/v2/runs/${credential.runId}/checkpoint?fromRevision=${fromRevision}`,
        { headers: authHeaders(credential.accessSecret) },
      );
      setCheckpoint(result);
      addActivity(`Checkpoint loaded from revision ${fromRevision}.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Checkpoint failed");
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  };

  const forgetGame = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setCredential(null);
    setState(null);
    setCheckpoint(null);
    setTurnHistory([]);
    setActivity([]);
    setError(null);
  };

  const pending = state?.gameplay.eventLifecycle.pending ?? null;
  const pendingTemplate = useMemo(() => {
    if (!pending) return null;
    try {
      return getEventTemplate(pending.templateId, pending.templateVersion);
    } catch {
      return null;
    }
  }, [pending]);
  const activeConcept = getEducationConcept(activeConceptId) ?? EDUCATION_CONCEPTS[0]!;
  const latestTurn = turnHistory[0] ?? null;

  if (!state) {
    const preset = PLAYER_PRESETS[presetId];
    const benefitsPackage = US_2026_SCENARIO_CATALOG.benefitsPackages.find(
      ({ id }) => id === preset.benefitsPackageId,
    )!;
    const household = US_2026_SCENARIO_CATALOG.households.find(
      ({ id }) => id === preset.householdId,
    )!;
    const availableHealthPlans = benefitsPackage.healthPlanIds.map(
      (planId) => US_2026_SCENARIO_CATALOG.healthPlans.find(({ id }) => id === planId)!,
    );
    const availableCoverage = benefitsPackage.insuranceCoverageIds.map(
      (coverageId) =>
        US_2026_SCENARIO_CATALOG.insuranceCoverages.find(({ id }) => id === coverageId)!,
    );
    return (
      <section className="play-start">
        <div>
          <p className="hero-kicker">Life Finance · learning simulation</p>
          <h1>Build a life, then stress-test it.</h1>
          <p className="lede">
            Choose a persona or adjust the numbers. The engine localizes salary,
            living cost, tax, benefits, risk, and the FI finish line.
          </p>
          <ul className="play-learning-list">
            <li>Build liquidity without giving up long-term compounding.</li>
            <li>See gross salary become tax, benefits, obligations, and take-home cash.</li>
            <li>Learn why diversification, insurance, and employer match matter.</li>
          </ul>
        </div>
        <div className="play-panel play-form">
          <h2>Create your starting position</h2>
          <label>
            Persona
            <select
              value={presetId}
              onChange={(event) => {
                const next = event.target.value as PlayerPresetId;
                setPresetId(next);
                setSalary(PLAYER_PRESETS[next].salaryDollars);
                setCash(PLAYER_PRESETS[next].defaultCashDollars);
                setHealthPlanId(PLAYER_PRESETS[next].healthPlanId);
                setCoverageIds(["insurance.renters"]);
              }}
            >
              {Object.entries(PLAYER_PRESETS).map(([id, option]) => (
                <option key={id} value={id}>{option.label}</option>
              ))}
            </select>
          </label>
          <div className="play-inline-fields">
            <label>Annual salary (USD)<input min="1" step="1000" type="number" value={salary} onChange={(event) => setSalary(event.target.valueAsNumber)} /></label>
            <label>Starting cash (USD)<input min="1000" max={preset.scenarioId === "scenario.fresh_start" ? 25000 : 100000} step="500" type="number" value={cash} onChange={(event) => setCash(event.target.valueAsNumber)} /></label>
          </div>
          <div className="play-inline-fields">
            <label>Student debt (USD, optional)<input min="0" step="1000" type="number" value={studentDebt} onChange={(event) => setStudentDebt(event.target.valueAsNumber)} /></label>
            <label>Monthly debt payment (USD)<input min="1" step="25" type="number" value={studentDebtPayment} onChange={(event) => setStudentDebtPayment(event.target.valueAsNumber)} /></label>
          </div>
          <fieldset className="benefit-choices">
            <legend>Choose health protection</legend>
            {availableHealthPlans.map((plan) => {
              const family = household.healthCoverageTier !== "self";
              const premium = family
                ? plan.monthlyEmployeePremiumFamilyCents
                : plan.monthlyEmployeePremiumSelfCents;
              const deductible = family
                ? plan.annualDeductibleFamilyCents
                : plan.annualDeductibleSelfCents;
              return (
                <label key={plan.id}>
                  <input checked={healthPlanId === plan.id} name="health-plan" onChange={() => setHealthPlanId(plan.id)} type="radio" />
                  <span><strong>{plan.label}</strong><small>{formatMoney(premium)}/month · {formatMoney(deductible)} deductible{plan.hsaEligible ? " · HSA eligible" : ""}</small></span>
                </label>
              );
            })}
          </fieldset>
          <fieldset className="benefit-choices">
            <legend>Optional insurance</legend>
            {availableCoverage.map((coverage) => (
              <label key={coverage.id}>
                <input
                  checked={coverageIds.includes(coverage.id)}
                  onChange={(event) =>
                    setCoverageIds((current) =>
                      event.target.checked
                        ? [...current, coverage.id]
                        : current.filter((id) => id !== coverage.id),
                    )
                  }
                  type="checkbox"
                />
                <span><strong>{coverage.label}</strong><small>{formatMoney(coverage.monthlyPremiumCents)}/month · {formatMoney(coverage.coverageLimitCents)} limit</small></span>
              </label>
            ))}
          </fieldset>
          <div className="preset-summary">
            <span>{preset.householdId.replace("household.", "").replaceAll("_", " ")}</span>
            <span>{healthPlanId.replace("health.", "").replaceAll("_", " ")}</span>
            <span>{preset.retirementPlanId.replace("retirement.", "").replaceAll("_", " ")}</span>
          </div>
          {error ? <p className="play-error" role="alert">{error}</p> : null}
          <button className="play-primary" disabled={busy} onClick={() => void createGame()} type="button">
            {busy ? busyLabel : "Create balance sheet"}
          </button>
          <p className="play-note">The anonymous run credential stays only in this browser tab.</p>
        </div>
      </section>
    );
  }

  const fi = calculateFinancialIndependence(state);
  const age = calculateAgeYears(state.player.birthMonth, state.currentMonth);
  const exposure = state.gameplay.exposure.current;
  const snapshot = state.gameplay.catalogSnapshot?.selected;
  const canOwnHome = snapshot?.scenario.allowsHomeOwnership === true;
  const hasHome = state.finances.homeValueCents > 0;
  const hasMortgage = state.gameplay.debts.termDebts.some(({ kind }) => kind === "mortgage");
  const hasDebt = state.gameplay.debts.termDebts.some(({ principalCents }) => principalCents > 0);
  const hsaStrategy = state.gameplay.benefits.hsaEligible === true ? strategy.hsa : 0;
  const preTaxTotal = strategy.retirement + hsaStrategy;
  const afterTaxTotal =
    strategy.index + strategy.sector + strategy.speculative + strategy.ira + strategy.debt;

  return (
    <section className="play-console">
      <header className="play-titlebar">
        <div>
          <p className="hero-kicker">Age {age} · {state.currentMonth}</p>
          <h1>{state.outcome ? `Grade ${state.outcome.grade}` : formatMoney(calculateNetWorth(state))}</h1>
          <p>{state.outcome ? state.outcome.kind.replaceAll("_", " ") : `Net worth · revision ${state.revision}`}</p>
        </div>
        <button className="play-quiet" onClick={forgetGame} type="button">Start over</button>
      </header>

      {error ? <p className="play-error" role="alert">{error}</p> : null}
      {busy ? <p className="play-working" role="status">{busyLabel}</p> : null}

      <div className="play-tabs" role="tablist" aria-label="Game sections">
        {(["overview", "strategy", "actions", "learn"] as const).map((item) => (
          <button aria-selected={tab === item} className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)} role="tab" type="button">
            {item === "learn" ? "Learn & glossary" : item[0]!.toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>

      {pending ? (
        <section className="play-panel play-event">
          <p className="hero-kicker">Personal shock · {pending.tier}</p>
          <h2>{titleFromId(pending.templateId)}</h2>
          <p>{pendingTemplate?.teachingPrinciple ?? `This event targets ${pending.targetedWeakness.replaceAll("_", " ")}.`}</p>
          <div className="event-parameters">
            {Object.entries(pending.parameters).map(([key, value]) => (
              <div key={key}><span>{key.replaceAll("_", " ")}</span><strong>{key.endsWith("cents") ? formatMoney(value) : value}</strong></div>
            ))}
          </div>
          <div className="event-choices">
            {pending.choiceIds.map((choiceId) => {
              const choice = pendingTemplate?.choices.find(({ id }) => id === choiceId);
              return (
                <button disabled={busy} key={choiceId} onClick={() => resolveChoice(choiceId)} type="button">
                  <strong>{choiceId.replaceAll("_", " ")}</strong>
                  <span>{choice?.principle ?? "Apply this engine-owned choice."}</span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {tab === "overview" ? (
        <>
          <section className="play-panel fi-panel">
            <div className="section-heading">
              <div><p className="hero-kicker">The finish line</p><h2>Financial independence</h2></div>
              <ConceptButton conceptId="financial_independence" onSelect={selectConcept} />
            </div>
            <div className="fi-numbers"><strong>{formatMoney(fi.investableAssetsCents)}</strong><span>of {formatMoney(fi.targetCents)} target</span></div>
            <div className="progress-track"><span style={{ width: `${fi.progressPpm / 10_000}%` }} /></div>
            <p className="play-note">{formatRate(fi.progressPpm)} complete · target = 25 × {formatMoney(state.finances.annualLivingCostCents)} annual living cost · home equity excluded.</p>
          </section>

          <div className="play-stats" aria-label="Current financial state">
            <div><span>Cash</span><strong>{formatMoney(state.finances.cashCents)}</strong></div>
            <div><span>Taxable investments</span><strong>{formatMoney(state.finances.taxableInvestmentsCents)}</strong></div>
            <div><span>Retirement</span><strong>{formatMoney(state.finances.retirementCents)}</strong></div>
            <div><span>Home value</span><strong>{formatMoney(state.finances.homeValueCents)}</strong></div>
            <div><span>Total liabilities</span><strong>{formatMoney(state.finances.nonCreditLiabilitiesCents + state.finances.creditUsedCents)}</strong></div>
            <div><span>Required each month</span><strong>{formatMoney(state.finances.requiredObligationsCents)}</strong></div>
          </div>

          {latestTurn ? (
            <section className="play-panel">
              <div className="section-heading">
                <div><p className="hero-kicker">Exact turn evidence · {latestTurn.processedMonth}</p><h2>Where the paycheck went</h2></div>
                <ConceptButton conceptId="tax_estimate" onSelect={selectConcept} />
              </div>
              <div className="cashflow-grid">
                <div><span>Gross salary</span><strong>{formatMoney(latestTurn.grossIncomeCents)}</strong></div>
                <div><span>401(k)</span><strong>−{formatMoney(latestTurn.recurringAllocations?.preTax.employee401kCents ?? 0)}</strong></div>
                <div><span>HSA</span><strong>−{formatMoney(latestTurn.recurringAllocations?.preTax.hsaCents ?? 0)}</strong></div>
                <div><span>Modeled tax</span><strong>{formatOutflow(latestTurn.totalTaxCents)}</strong></div>
                <div><span>Take-home payroll</span><strong>{formatMoney(latestTurn.afterTaxCashIncomeCents)}</strong></div>
                <div><span>Required obligations</span><strong>−{formatMoney(latestTurn.requiredCashCents)}</strong></div>
                <div><span>Employer match</span><strong>+{formatMoney(latestTurn.recurringAllocations?.preTax.employer401kMatchCents ?? 0)}</strong></div>
                <div><span>Debt interest</span><strong>{formatMoney(latestTurn.debtService.totalInterestCents)}</strong></div>
                <div><span>Market movement</span><strong>{formatMoney(latestTurn.marketValueChangeCents)}</strong></div>
                <div><span>Broad-equity return</span><strong>{formatRate(latestTurn.market.equityReturnPpm)}</strong></div>
                <div><span>Inflation this month</span><strong>{formatRate(latestTurn.market.inflationPpm)}</strong></div>
                <div><span>Index allocation</span><strong>{formatMoney(latestTurn.recurringAllocations?.afterTax.broadIndexCents ?? 0)}</strong></div>
                <div><span>Sector allocation</span><strong>{formatMoney(latestTurn.recurringAllocations?.afterTax.sectorCents ?? 0)}</strong></div>
                <div><span>Speculative allocation</span><strong>{formatMoney(latestTurn.recurringAllocations?.afterTax.speculativeCents ?? 0)}</strong></div>
                <div><span>IRA allocation</span><strong>{formatMoney(latestTurn.recurringAllocations?.afterTax.iraCents ?? 0)}</strong></div>
                <div><span>Forced asset sale</span><strong>{formatMoney(latestTurn.funding?.grossLiquidationCents ?? 0)}</strong></div>
                <div><span>Emergency credit draw</span><strong>{formatMoney(latestTurn.funding?.creditDrawnCents ?? 0)}</strong></div>
              </div>
              <p className="play-note">Educational estimate · pinned 2026 tax policy · trace {latestTurn.taxTraceId}</p>
            </section>
          ) : (
            <section className="play-panel empty-recap">
              <h2>Run a month to reveal tax and cash flow</h2>
              <p>Gross salary will be split into pre-tax saving, modeled federal/state tax, take-home income, required costs, debt, and your chosen investments.</p>
            </section>
          )}

          <div className="play-grid">
            <section className="play-panel">
              <div className="section-heading"><h2>Exposure</h2><ConceptButton conceptId="exposure" onSelect={selectConcept} /></div>
              {exposure ? (
                <dl className="metric-list">
                  <div><dt>Emergency runway</dt><dd>{formatRunway(exposure.emergencyFundMonthsPpm)}</dd></div>
                  <div><dt>Debt to income</dt><dd>{formatRate(exposure.debtToIncomePpm)}</dd></div>
                  <div><dt>Credit utilization</dt><dd>{formatRate(exposure.revolvingDebtPpm)}</dd></div>
                  <div><dt>Insurance gap</dt><dd>{formatRate(exposure.insuranceGapPpm)}</dd></div>
                  <div><dt>Portfolio concentration</dt><dd>{formatRate(exposure.portfolioConcentrationPpm)}</dd></div>
                  <div><dt>Job/investment correlation</dt><dd>{formatRate(exposure.jobInvestmentCorrelationPpm)}</dd></div>
                </dl>
              ) : <p className="play-note">Exposure is measured after the first processed month.</p>}
            </section>

            <section className="play-panel">
              <h2>Benefits & protection</h2>
              {snapshot ? (
                <dl className="metric-list">
                  <div><dt>Health plan</dt><dd>{snapshot.healthPlan.label}</dd></div>
                  <div><dt>Monthly premium</dt><dd>{formatMoney(snapshot.household.healthCoverageTier === "self" ? snapshot.healthPlan.monthlyEmployeePremiumSelfCents : snapshot.healthPlan.monthlyEmployeePremiumFamilyCents)}</dd></div>
                  <div><dt>Annual deductible</dt><dd>{formatMoney(snapshot.household.healthCoverageTier === "self" ? snapshot.healthPlan.annualDeductibleSelfCents : snapshot.healthPlan.annualDeductibleFamilyCents)}</dd></div>
                  <div><dt>Out-of-pocket max</dt><dd>{formatMoney(snapshot.household.healthCoverageTier === "self" ? snapshot.healthPlan.annualOutOfPocketMaximumSelfCents : snapshot.healthPlan.annualOutOfPocketMaximumFamilyCents)}</dd></div>
                  <div><dt>Retirement plan</dt><dd>{snapshot.retirementPlan.label}</dd></div>
                  <div><dt>Other coverage</dt><dd>{snapshot.insuranceCoverages.map(({ label }) => label).join(", ") || "None"}</dd></div>
                </dl>
              ) : null}
            </section>
          </div>

          <section className="play-panel">
            <h2>Macro feed</h2>
            {state.gameplay.eventLifecycle.macroStories.length ? state.gameplay.eventLifecycle.macroStories.map((story) => {
              const template = getEventTemplate(story.templateId, story.templateVersion);
              return <article className="macro-item" key={story.storyId}><strong>{titleFromId(story.templateId)}</strong><span>{template.teachingPrinciple}</span><small>{story.startedMonth} → {story.expiresMonth}</small></article>;
            }) : <p className="play-note">No active macro story. The market still moves each month under the current {state.marketRegime} regime.</p>}
          </section>
        </>
      ) : null}

      {tab === "strategy" ? (
        <section className="play-panel play-form">
          <div className="section-heading"><div><p className="hero-kicker">Recurring every month</p><h2>Offense and resilience</h2></div><ConceptButton conceptId="401k" onSelect={selectConcept} /></div>
          <p className="play-note">401(k) and HSA use gross salary. Index, sector, speculative, IRA, and extra debt use cash remaining after tax and required obligations.</p>
          <div className="strategy-grid">
            {([
              ["retirement", "401(k)", "401k"],
              ["hsa", "HSA", "hsa"],
              ["index", "Broad index", "broad_index"],
              ["sector", "Sector stocks", "sector_investing"],
              ["speculative", "Speculative", "speculation"],
              ["ira", "IRA", "ira"],
              ["debt", "Extra debt payoff", "dti"],
            ] as const).map(([key, label, conceptId]) => (
              <label key={key}>
                <span>{label} <ConceptButton conceptId={conceptId} onSelect={selectConcept} /></span>
                <input disabled={(key === "debt" && !hasDebt) || (key === "hsa" && !state.gameplay.benefits.hsaEligible)} min="0" max="100" step="0.5" type="number" value={key === "hsa" ? hsaStrategy : strategy[key]} onChange={(event) => setStrategy({ ...strategy, [key]: event.target.valueAsNumber })} />
                <small>%</small>
              </label>
            ))}
          </div>
          <div className={`allocation-check ${preTaxTotal > 100 || afterTaxTotal > 100 ? "invalid" : ""}`}>
            <span>Pre-tax total: {preTaxTotal}%</span><span>After-tax total: {afterTaxTotal}%</span>
          </div>
          <button disabled={busy || Boolean(state.outcome) || preTaxTotal > 100 || afterTaxTotal > 100} onClick={saveStrategy} type="button">Save recurring strategy</button>
        </section>
      ) : null}

      {tab === "actions" ? (
        <section className="play-panel play-form">
          <div><p className="hero-kicker">One-time levers</p><h2>Act on the balance sheet</h2></div>
          <label>
            Action
            <select value={action} onChange={(event) => setAction(event.target.value)}>
              <option value="invest_taxable">Invest in broad index</option>
              <option value="invest_sector">Invest in job-correlated sector</option>
              <option value="invest_speculative">Make a speculative investment</option>
              <option value="liquidate_taxable">Sell broad-index investment</option>
              <option value="contribute_ira">Contribute to IRA</option>
              {state.gameplay.benefits.hsaEligible ? <option value="contribute_hsa">Contribute to HSA</option> : null}
              {hasDebt ? <option value="pay_term_debt">Pay highest-priority term debt</option> : null}
              {state.finances.creditUsedCents > 0 ? <option value="pay_revolving_credit">Pay revolving credit</option> : null}
              <option value="draw_revolving_credit">Draw revolving credit</option>
              {state.gameplay.portfolio.retirement401kCents > 0 ? <option value="withdraw_401k">Withdraw 401(k) early</option> : null}
              {state.gameplay.portfolio.retirementIraCents > 0 ? <option value="withdraw_ira">Withdraw IRA early</option> : null}
              {canOwnHome && !hasHome ? <option value="purchase_home">Purchase a home</option> : null}
              {hasHome ? <option value="sell_home">Sell the home</option> : null}
              {hasMortgage ? <option value="refinance_home">Refinance mortgage</option> : null}
              <option value="reduce_lifestyle">Reduce annual lifestyle cost</option>
              <option value="increase_lifestyle">Increase annual lifestyle cost</option>
              <option value="start_upskill">Start an education program</option>
            </select>
          </label>
          <div className="action-guidance">
            <p>{ACTION_GUIDANCE[action]?.summary}</p>
            <ConceptButton conceptId={ACTION_GUIDANCE[action]?.conceptId ?? "liquidity"} onSelect={selectConcept} />
          </div>
          {!['sell_home', 'refinance_home', 'start_upskill'].includes(action) ? <label>{action === "purchase_home" ? "Purchase price" : "Amount"} (USD)<input min="1" step="100" type="number" value={actionAmount} onChange={(event) => setActionAmount(event.target.valueAsNumber)} /></label> : null}
          {action === "purchase_home" ? <label>Down payment (USD)<input min="0" step="1000" type="number" value={secondaryAmount} onChange={(event) => setSecondaryAmount(event.target.valueAsNumber)} /></label> : null}
          {action === "purchase_home" || action === "refinance_home" ? <div className="play-inline-fields"><label>Mortgage rate %<input min="0" max="50" step="0.1" type="number" value={mortgageRate} onChange={(event) => setMortgageRate(event.target.valueAsNumber)} /></label><label>Term in months<input min="12" max="480" step="12" type="number" value={mortgageTerm} onChange={(event) => setMortgageTerm(event.target.valueAsNumber)} /></label></div> : null}
          {action === "start_upskill" ? <label>Program<select value={upskillProgram} onChange={(event) => setUpskillProgram(event.target.value as typeof upskillProgram)}><option value="upskill.certificate">Certificate · short / lower cost</option><option value="upskill.bootcamp">Bootcamp · medium duration / raise</option><option value="upskill.degree">Degree · long / highest raise</option></select></label> : null}
          <button disabled={busy || Boolean(state.outcome)} onClick={takeAction} type="button">Apply action</button>
        </section>
      ) : null}

      {tab === "learn" ? (
        <div className="learn-layout">
          <nav className="play-panel glossary-list" aria-label="Financial glossary">
            <p className="hero-kicker">{EDUCATION_CONTENT_VERSION}</p>
            {EDUCATION_CONCEPTS.map((concept) => <button className={activeConcept.id === concept.id ? "active" : ""} key={concept.id} onClick={() => setActiveConceptId(concept.id)} type="button">{concept.title}</button>)}
          </nav>
          <article className="play-panel concept-card">
            <p className="hero-kicker">What it means</p><h2>{activeConcept.title}</h2><p>{activeConcept.shortDefinition}</p>
            <h3>Why it matters now</h3><p>{activeConcept.whyItMatters}</p>
            <h3>The trade-off</h3><p>{activeConcept.decisionTradeoff}</p>
          </article>
        </div>
      ) : null}

      <section className="play-turn">
        <button className="play-primary" disabled={busy || Boolean(pending) || Boolean(state.outcome)} onClick={() => void runMonths(1)} type="button">Run 1 month</button>
        <button disabled={busy || Boolean(pending) || Boolean(state.outcome)} onClick={() => void runMonths(3)} type="button">Run up to 3 months</button>
        <button disabled={busy || Boolean(pending) || Boolean(state.outcome)} onClick={() => void runMonths(12)} type="button">Run to next year/event</button>
        <button disabled={busy} onClick={() => void loadCheckpoint()} type="button">Load checkpoint</button>
      </section>
      <p className="play-note">Fast-forward stops immediately at a required event or terminal outcome. A cold first tax calculation may take 20–30 seconds.</p>

      {checkpoint ? (
        <section className="play-panel">
          <div><p className="hero-kicker">Reconciled evidence</p><h2>Checkpoint · {checkpoint.evidence.monthsProcessed} month(s)</h2></div>
          <div className="cashflow-grid">
            <div><span>Gross income</span><strong>{formatMoney(checkpoint.evidence.totalGrossIncomeCents)}</strong></div>
            <div><span>Modeled tax</span><strong>{formatMoney(checkpoint.evidence.totalTaxCents)}</strong></div>
            <div><span>Required cash</span><strong>{formatMoney(checkpoint.evidence.totalRequiredCashCents)}</strong></div>
            <div><span>Debt interest</span><strong>{formatMoney(checkpoint.evidence.totalDebtInterestCents)}</strong></div>
            <div><span>Net-worth change</span><strong>{formatMoney(checkpoint.evidence.netWorthChangeCents)}</strong></div>
            <div><span>Market change</span><strong>{formatMoney(checkpoint.evidence.totalMarketValueChangeCents)}</strong></div>
          </div>
          <p className="play-note">Every total reconciles to immutable monthly command and tax records.</p>
        </section>
      ) : null}

      <section className="play-panel">
        <h2>Decision log</h2>
        {activity.length ? <ol className="play-activity">{activity.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ol> : <p className="play-note">No commands yet.</p>}
      </section>
    </section>
  );
}
