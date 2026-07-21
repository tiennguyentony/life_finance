"use client";

import { useMemo } from "react";

import type { RunViewWire } from "@/contracts/api/contracts";

import { hqTab } from "../hq-tabs";
import { HqCard, HqScreenHead, HqUnavailable } from "../hq-ui";
import { projectContributionBuckets } from "../hq-derivations";
import {
  allocationTotals,
  DIALS,
  draftDiffersFromStrategy,
  type Dial,
  type EditableRate,
  type InvestDraft,
} from "../invest-model";
import { formatCents, formatPpmPercent } from "../hq-view";

type Props = Readonly<{
  busy: boolean;
  /** Owned by the shell so the plan bar and this screen never disagree. */
  draft: InvestDraft;
  /**
   * Applies one step. The shell resolves it against the latest draft, so
   * several clicks in the same tick each land instead of overwriting.
   */
  onAdjust: (key: EditableRate, deltaPpm: number, maxPpm: number) => void;
  run: RunViewWire;
}>;

export function InvestScreen({ busy, draft, onAdjust, run }: Props) {
  const bengo = hqTab("invest");
  const changed = draftDiffersFromStrategy(draft, run.strategy);
  const tiers = run.benefits?.retirementPlan.employerMatchTiers ?? null;

  const projected = useMemo(
    () =>
      projectContributionBuckets(
        run.income.annualGrossSalaryCents,
        draft,
        run.benefits?.retirementPlan.employerMatchTiers ?? null,
      ),
    [draft, run.income.annualGrossSalaryCents, run.benefits],
  );

  const noSalary = run.income.annualGrossSalaryCents === null;
  const totals = allocationTotals(draft);
  const maxTermAprPpm = run.debts.termDebts.reduce(
    (max, debt) => Math.max(max, debt.annualInterestRatePpm),
    0,
  );

  return (
    <div className="hq-screen">
      <HqScreenHead
        characterName={bengo.characterName}
        characterSrc={bengo.characterSrc}
        line="Compounding always works."
        lineTone="positive"
        title="Invest"
      >
        {tiers !== null && tiers.length > 0 ? (
          <span className="hq-chip" data-tone="caution">
            ⚡ free match +{formatCents(projected.employerMatchMonthlyCents)}/mo
          </span>
        ) : null}
      </HqScreenHead>

      {noSalary ? (
        <HqUnavailable>
          Contribution rates are a share of salary, and this run has no
          employment income right now. The dials stay available, but they move no
          money until you are earning again.
        </HqUnavailable>
      ) : null}

      <div className="hq-grid-3">
        <HqCard style={{ border: "2px solid var(--hq-blue-soft)" }}>
          <div className="hq-eyebrow">🔒 Locked to 65</div>
          <div className="hq-figure" style={{ fontSize: "2.125rem", margin: "0.125rem 0" }}>
            ≈{formatCents(projected.lockedMonthlyCents)}
            <span className="hq-figure-unit">/mo</span>
          </div>
          <div className="hq-chip-row">
            <span className="hq-chip">
              401(k) {formatCents(projected.preTax401kMonthlyCents)}
            </span>
            <span className="hq-chip" data-tone="positive">
              match +{formatCents(projected.employerMatchMonthlyCents)}
            </span>
            {projected.hsaMonthlyCents > 0 ? (
              <span className="hq-chip">
                HSA {formatCents(projected.hsaMonthlyCents)}
              </span>
            ) : null}
            <span className="hq-chip">
              IRA {formatCents(projected.iraMonthlyCents)}
            </span>
          </div>
        </HqCard>

        <HqCard style={{ border: "2px solid var(--hq-purple-soft)" }}>
          <div className="hq-eyebrow">🔓 Anytime money</div>
          <div className="hq-figure" style={{ fontSize: "2.125rem", margin: "0.125rem 0" }}>
            ≈{formatCents(projected.taxableMonthlyCents)}
            <span className="hq-figure-unit">/mo</span>
          </div>
          <div className="hq-chip-row">
            <span className="hq-chip">
              index {formatCents(projected.broadIndexMonthlyCents)} ●○○
            </span>
            <span className="hq-chip">
              sector {formatCents(projected.sectorMonthlyCents)} ●●○
            </span>
            <span className="hq-chip">
              wild {formatCents(projected.speculativeMonthlyCents)} ●●●
            </span>
          </div>
        </HqCard>

        <HqCard style={{ border: "2px solid var(--hq-red-soft)" }}>
          <div className="hq-eyebrow">⚔ Debt slayer</div>
          <div className="hq-figure" style={{ fontSize: "2.125rem", margin: "0.125rem 0" }}>
            ≈{formatCents(projected.extraDebtMonthlyCents)}
            <span className="hq-figure-unit">/mo</span>
          </div>
          <div className="hq-chip-row">
            {maxTermAprPpm > 0 ? (
              <span className="hq-chip">
                extra on the {formatPpmPercent(maxTermAprPpm, 1)} loan
              </span>
            ) : (
              <span className="hq-chip">no active term debt to target</span>
            )}
          </div>
        </HqCard>
      </div>

      <HqCard>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <div className="hq-eyebrow">Your dials</div>
          <div className="hq-planbar-spacer" />
          <span
            className="hq-chip"
            data-tone={totals.preTaxPpm > 1_000_000 ? "negative" : undefined}
          >
            pre-tax {formatPpmPercent(totals.preTaxPpm, 1)}
          </span>
          <span
            className="hq-chip"
            data-tone={totals.afterTaxPpm > 1_000_000 ? "negative" : undefined}
          >
            after-tax {formatPpmPercent(totals.afterTaxPpm, 1)}
          </span>
          {changed ? (
            <span className="hq-chip" data-tone="caution">
              new recurring plan
            </span>
          ) : null}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 26rem), 1fr))",
            gap: "0.5rem 1.25rem",
            marginTop: "0.625rem",
          }}
        >
          {DIALS.map((dial) => (
            <DialRow
              busy={busy}
              dial={dial}
              key={dial.key}
              monthlyCents={monthlyForDial(projected, dial.key)}
              onAdjust={onAdjust}
              valuePpm={draft[dial.key]}
            />
          ))}
        </div>

        {changed ? (
          <p className="hq-note" data-tone="caution" style={{ marginTop: "0.75rem" }}>
            These rates are saved as your recurring strategy when you live the
            month. They apply every month from now on, not just this one.
          </p>
        ) : (
          <p className="hq-note" style={{ marginTop: "0.75rem" }}>
            Matches your current recurring strategy. Adjust a dial to plan a
            change.
          </p>
        )}
        <p className="hq-note" style={{ marginTop: "0.5rem" }}>
          Dollar amounts marked ≈ are planning illustrations from your salary
          and selected rates. The engine applies annual account limits and
          calculates after-tax buckets from cash left after taxes, required
          bills, and safety retention. The month result is the authoritative
          amount actually moved.
        </p>
      </HqCard>
    </div>
  );
}

function monthlyForDial(
  projected: ReturnType<typeof projectContributionBuckets>,
  key: EditableRate,
): number {
  switch (key) {
    case "preTax401kSalaryRatePpm":
      return projected.preTax401kMonthlyCents;
    case "preTaxHsaSalaryRatePpm":
      return projected.hsaMonthlyCents;
    case "afterTaxIraRatePpm":
      return projected.iraMonthlyCents;
    case "afterTaxBroadIndexRatePpm":
      return projected.broadIndexMonthlyCents;
    case "afterTaxSectorRatePpm":
      return projected.sectorMonthlyCents;
    case "afterTaxSpeculativeRatePpm":
      return projected.speculativeMonthlyCents;
    case "afterTaxExtraDebtRatePpm":
      return projected.extraDebtMonthlyCents;
  }
}

type DialRowProps = Readonly<{
  busy: boolean;
  dial: Dial;
  monthlyCents: number;
  onAdjust: (key: EditableRate, deltaPpm: number, maxPpm: number) => void;
  valuePpm: number;
}>;

function DialRow({ busy, dial, monthlyCents, onAdjust, valuePpm }: DialRowProps) {
  return (
    <div className="hq-dial-row">
      <span className="hq-dial-label" title={dial.hint}>
        {dial.label}
      </span>
      <div className="hq-dial-track">
        <div
          className="hq-dial-fill"
          style={{ width: `${Math.min(100, (valuePpm / dial.maxPpm) * 100)}%` }}
        />
      </div>
      <button
        aria-label={`Decrease ${dial.label}`}
        className="hq-topbar-action"
        disabled={busy || valuePpm <= 0}
        onClick={() => onAdjust(dial.key, -dial.stepPpm, dial.maxPpm)}
        style={{ padding: "0.125rem 0.625rem" }}
        type="button"
      >
        −
      </button>
      <b
        style={{
          width: 46,
          textAlign: "center",
          font: "800 0.875rem var(--hq-display)",
        }}
      >
        {formatPpmPercent(valuePpm, 1)}
      </b>
      <button
        aria-label={`Increase ${dial.label}`}
        className="hq-topbar-action"
        disabled={busy || valuePpm >= dial.maxPpm}
        onClick={() => onAdjust(dial.key, dial.stepPpm, dial.maxPpm)}
        style={{ padding: "0.125rem 0.625rem" }}
        type="button"
      >
        +
      </button>
      <b
        style={{
          width: 66,
          textAlign: "right",
          font: "700 0.71875rem var(--hq-body-font)",
          color: "var(--hq-soft)",
        }}
      >
        ≈{formatCents(monthlyCents)}
      </b>
    </div>
  );
}
