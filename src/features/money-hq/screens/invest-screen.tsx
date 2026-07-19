"use client";

import { useMemo } from "react";

import type { RunViewWire } from "@/contracts/api/contracts";

import { hqTab } from "../hq-tabs";
import { HqCard, HqSpeech, HqUnavailable } from "../hq-ui";
import { projectContributionBuckets } from "../hq-derivations";
import {
  adjustDraft,
  DIALS,
  draftDiffersFromStrategy,
  type Dial,
  type EditableRate,
  type InvestDraft,
} from "../invest-model";
import { formatCents, formatPpmPercent, type HqView } from "../hq-view";

export type InvestLayout = "lab" | "mountain" | "buckets";

const LAYOUTS: readonly Readonly<{ id: InvestLayout; label: string; hint: string }>[] =
  Object.freeze([
    { id: "buckets", label: "Three buckets", hint: "sorted by when you can touch it" },
    { id: "lab", label: "Bengo's lab", hint: "one dial per account" },
    { id: "mountain", label: "Compounding mountain", hint: "the long view" },
  ]);

type Props = Readonly<{
  busy: boolean;
  /** Owned by the shell so the plan bar and this screen never disagree. */
  draft: InvestDraft;
  layout: InvestLayout;
  /**
   * Applies one step. The shell resolves it against the latest draft, so
   * several clicks in the same tick each land instead of overwriting.
   */
  onAdjust: (key: EditableRate, deltaPpm: number, maxPpm: number) => void;
  onLayout: (layout: InvestLayout) => void;
  run: RunViewWire;
  view: HqView;
}>;

export function InvestScreen({ busy, draft, layout, onAdjust, onLayout, run, view }: Props) {
  const bengo = hqTab("invest");
  const changed = draftDiffersFromStrategy(draft, run.strategy);

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

  return (
    <div className="hq-screen">
      <div className="hq-screen-head">
        <div>
          <h2 className="hq-screen-title">{titleFor(layout)}</h2>
          <p className="hq-screen-subtitle">{subtitleFor(layout)}</p>
        </div>
        <div className="hq-planbar-spacer" />
        <HqSpeech characterName={bengo.characterName} characterSrc={bengo.characterSrc}>
          Compound interest is the only spell that always works.
        </HqSpeech>
      </div>

      <div
        aria-label="Invest layout"
        className="hq-chip-row"
        role="tablist"
        style={{ marginTop: 0 }}
      >
        {LAYOUTS.map((option) => (
          <button
            aria-selected={option.id === layout}
            className="hq-topbar-action"
            key={option.id}
            onClick={() => onLayout(option.id)}
            role="tab"
            style={
              option.id === layout
                ? { background: "var(--hq-gold-soft)", color: "var(--hq-gold-ink)" }
                : undefined
            }
            type="button"
          >
            {option.label}
            <span className="hq-nav-hint" style={{ display: "block" }}>
              {option.hint}
            </span>
          </button>
        ))}
      </div>

      {noSalary ? (
        <HqUnavailable>
          Contribution rates are a share of salary, and this run has no
          employment income right now. The dials stay available, but they move no
          money until you are earning again.
        </HqUnavailable>
      ) : null}

      <MatchBanner matchMonthlyCents={projected.employerMatchMonthlyCents} run={run} />

      {layout === "buckets" ? (
        <BucketsLayout projected={projected} run={run} />
      ) : layout === "mountain" ? (
        <MountainLayout projected={projected} />
      ) : null}

      <HqCard eyebrow="Set your monthly plan">
        <div style={{ display: "grid", gap: "0.5rem" }}>
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

function titleFor(layout: InvestLayout): string {
  if (layout === "buckets") return "Sort your paycheck into buckets";
  if (layout === "mountain") return "The Compounding Mountain";
  return "Bengo's Investment Lab";
}

function subtitleFor(layout: InvestLayout): string {
  if (layout === "buckets") {
    return "Same numbers, sorted by when you can touch the money.";
  }
  if (layout === "mountain") {
    return "Same lab, one big picture: time does more climbing than money does.";
  }
  return "One dial per account. Every change is a recurring strategy, not a one-off.";
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
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "0.625rem",
        padding: "0.5rem 0.75rem",
        borderRadius: 12,
        background: "var(--hq-stage)",
      }}
    >
      <div style={{ minWidth: "11rem", flex: 1 }}>
        <div style={{ font: "800 0.8125rem var(--hq-display)" }}>{dial.label}</div>
        <div className="hq-nav-hint">{dial.hint}</div>
      </div>
      <button
        aria-label={`Decrease ${dial.label}`}
        className="hq-topbar-action"
        disabled={busy || valuePpm <= 0}
        onClick={() => onAdjust(dial.key, -dial.stepPpm, dial.maxPpm)}
        type="button"
      >
        −
      </button>
      <span
        style={{
          minWidth: "8rem",
          textAlign: "center",
          font: "800 0.9375rem var(--hq-display)",
        }}
      >
        {formatPpmPercent(valuePpm, 1)}
        <span className="hq-nav-hint" style={{ display: "block" }}>
          {formatCents(monthlyCents)}/mo
        </span>
      </span>
      <button
        aria-label={`Increase ${dial.label}`}
        className="hq-topbar-action"
        disabled={busy || valuePpm >= dial.maxPpm}
        onClick={() => onAdjust(dial.key, dial.stepPpm, dial.maxPpm)}
        type="button"
      >
        +
      </button>
    </div>
  );
}

type MatchBannerProps = Readonly<{
  /** Derived from the draft, so the banner tracks the dials as they move. */
  matchMonthlyCents: number;
  run: RunViewWire;
}>;

function MatchBanner({ matchMonthlyCents, run }: MatchBannerProps) {
  const tiers = run.benefits?.retirementPlan.employerMatchTiers ?? null;
  if (tiers === null || tiers.length === 0) {
    return (
      <HqUnavailable>
        This run records no employer match policy, so no free-money figure is
        shown here.
      </HqUnavailable>
    );
  }

  const description = tiers
    .map(
      (tier) =>
        `${formatPpmPercent(tier.employerMatchRatePpm)} up to ${formatPpmPercent(
          tier.employeeContributionRateUpToPpm,
        )}`,
    )
    .join(", then ");

  return (
    <p className="hq-note" data-tone="positive">
      ⚡ Employer match: {description} of salary — this plan earns{" "}
      <b>{formatCents(matchMonthlyCents)}/mo</b> of free money.
    </p>
  );
}

type LayoutProps = Readonly<{
  projected: ReturnType<typeof projectContributionBuckets>;
  run: RunViewWire;
}>;

function BucketsLayout({ projected, run }: LayoutProps) {
  const targetAge = run.goal.targetAgeYears;

  return (
    <div className="hq-columns" data-balance="even">
      <div className="hq-column">
        <HqCard eyebrow={`Locked until ~${targetAge} · pre-tax perks`}>
          <div className="hq-figure" style={{ fontSize: "1.75rem" }}>
            {formatCents(projected.lockedMonthlyCents)}
            <span className="hq-figure-unit">/mo</span>
          </div>
          <BucketLine
            label="401(k)"
            value={formatCents(projected.preTax401kMonthlyCents)}
          />
          <BucketLine
            label="⚡ Employer match — free"
            tone="positive"
            value={`+${formatCents(projected.employerMatchMonthlyCents)}`}
          />
          <BucketLine label="HSA" value={formatCents(projected.hsaMonthlyCents)} />
          <BucketLine
            label="Roth IRA — after-tax"
            value={formatCents(projected.iraMonthlyCents)}
          />
          <p className="hq-note" style={{ marginTop: "0.5rem" }}>
            Counts toward net worth, not toward bills. Taking it early costs
            withholding plus a 10% penalty in this simulation.
          </p>
        </HqCard>

        <HqCard eyebrow="Debt slayer · beyond the minimum">
          <div className="hq-figure" style={{ fontSize: "1.75rem" }}>
            {formatCents(projected.extraDebtMonthlyCents)}
            <span className="hq-figure-unit">/mo</span>
          </div>
          <p className="hq-note" data-tone="positive" style={{ margin: 0 }}>
            A paid debt is a bill that can never surprise you again.
          </p>
        </HqCard>
      </div>

      <div className="hq-column">
        <HqCard eyebrow="Taxable · sellable any month">
          <div className="hq-figure" style={{ fontSize: "1.75rem" }}>
            {formatCents(projected.taxableMonthlyCents)}
            <span className="hq-figure-unit">/mo</span>
          </div>
          <BucketLine
            hint="thousands of companies in one fund · risk ●○○"
            label="Broad index"
            value={formatCents(projected.broadIndexMonthlyCents)}
          />
          <BucketLine
            hint="⚠ often the same industry as your job — one crash hits both · risk ●●○"
            label="Sector"
            value={formatCents(projected.sectorMonthlyCents)}
          />
          <BucketLine
            hint="a recent win proves nothing · risk ●●●"
            label="Speculative"
            value={formatCents(projected.speculativeMonthlyCents)}
          />
          <p className="hq-note" style={{ marginTop: "0.5rem" }}>
            This is your bridge to FI before retirement age — liquid, but it
            rides every market wave.
          </p>
        </HqCard>

        <HqCard eyebrow="Which bucket first?">
          <ol
            style={{
              margin: 0,
              paddingLeft: "1.125rem",
              font: "700 0.78125rem var(--hq-body-font)",
              color: "var(--hq-muted)",
              display: "grid",
              gap: "0.25rem",
            }}
          >
            <li>Grab the full employer match</li>
            <li>Slay high-APR debt</li>
            <li>Fill the emergency fund</li>
            <li>Max the tax-advantaged locks</li>
            <li>Then grow anytime money</li>
          </ol>
        </HqCard>
      </div>
    </div>
  );
}

function MountainLayout({ projected }: Readonly<{ projected: LayoutProps["projected"] }>) {
  const total =
    projected.lockedMonthlyCents +
    projected.taxableMonthlyCents +
    projected.extraDebtMonthlyCents;

  return (
    <HqCard accent="green">
      <div className="hq-figure">
        {formatCents(total)}
        <span className="hq-figure-unit">/mo toward future you</span>
      </div>
      <p
        style={{
          font: "600 0.8125rem var(--hq-body-font)",
          color: "var(--hq-body)",
          lineHeight: 1.5,
        }}
      >
        <b>Compounding:</b> returns earn later returns. Waiting five years to
        start costs more than any bad month ever will.
      </p>
      <HqUnavailable>
        A projected growth curve needs the engine&rsquo;s multi-month projection,
        which no API route exposes yet. The monthly figure above is derived from
        your own salary and rates.
      </HqUnavailable>
    </HqCard>
  );
}

type BucketLineProps = Readonly<{
  label: string;
  value: string;
  hint?: string;
  tone?: "positive";
}>;

function BucketLine({ label, value, hint, tone }: BucketLineProps) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "0.75rem",
        padding: "0.3125rem 0",
        borderBottom: "1.5px dashed var(--hq-line)",
      }}
    >
      <span style={{ font: "700 0.75rem var(--hq-body-font)", color: "var(--hq-muted)" }}>
        {label}
        {hint ? (
          <span className="hq-nav-hint" style={{ display: "block" }}>
            {hint}
          </span>
        ) : null}
      </span>
      <b
        style={{
          font: "800 0.78125rem var(--hq-body-font)",
          color: tone === "positive" ? "var(--hq-green-deep)" : "var(--hq-ink)",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </b>
    </div>
  );
}
