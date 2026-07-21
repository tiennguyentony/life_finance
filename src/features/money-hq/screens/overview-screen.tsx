"use client";

import Image from "next/image";

import type { RunViewWire } from "@/contracts/api/contracts";

import { HqRing } from "../hq-chrome";
import { HqBanner, HqCard } from "../hq-ui";
import type { TrailPoint } from "../run-trail";
import { TrendChart } from "../trend-chart";
import { hqTab, type HqTabId } from "../hq-tabs";
import {
  formatCents,
  formatPpmPercent,
  formatShortMonthLabel,
  type HqView,
} from "../hq-view";
import type { TaxLoadState } from "./tax-screen";

const BAND_COPY: Readonly<Record<RunViewWire["preparedness"]["band"], string>> = {
  critical: "Critical",
  exposed: "Exposed",
  stable: "Stable",
  resilient: "Resilient",
};

const BAND_RING_COLOR: Readonly<Record<RunViewWire["preparedness"]["band"], string>> = {
  critical: "var(--hq-red-bright)",
  exposed: "#f2b64c",
  stable: "var(--hq-green)",
  resilient: "var(--hq-green)",
};

const BAND_CHIP_TONE: Readonly<
  Record<RunViewWire["preparedness"]["band"], "positive" | "caution" | "negative">
> = {
  critical: "negative",
  exposed: "caution",
  stable: "positive",
  resilient: "positive",
};

/** Keyed by the preparedness component field names the wire reports. */
const WEAKEST_COPY: Readonly<Record<string, string>> = {
  liquidityPpm: "Emergency fund",
  cashFlowPpm: "Cash flow",
  debtPpm: "Debt",
  insurancePpm: "Insurance",
  diversificationPpm: "Investment mix",
};

const WEAKEST_TAB: Readonly<Record<string, HqTabId>> = {
  liquidityPpm: "safety",
  cashFlowPpm: "budget",
  debtPpm: "debt",
  insurancePpm: "safety",
  diversificationPpm: "invest",
};

function weakestComponent(
  components: RunViewWire["preparedness"]["components"],
): Readonly<{ key: string; scorePpm: number }> {
  const entries = Object.entries(components);
  const [key = "liquidityPpm", scorePpm = 0] = entries.reduce(
    (lowest, entry) => (entry[1] < lowest[1] ? entry : lowest),
    entries[0] ?? ["liquidityPpm", 0],
  );
  return { key, scorePpm };
}

type Props = Readonly<{
  run: RunViewWire;
  view: HqView;
  trail: readonly TrailPoint[];
  onSelectTab: (tab: HqTabId) => void;
  /**
   * The same lazy tax load the Tax tab uses; the flow card needs modeled
   * take-home. Optional so scripted scenes without a tax API still render.
   */
  taxLoadState?: TaxLoadState;
}>;

export function OverviewScreen({ run, view, trail, onSelectTab, taxLoadState }: Props) {
  const penny = hqTab("overview");
  const weakest = weakestComponent(run.preparedness.components);
  const weakestLabel = WEAKEST_COPY[weakest.key] ?? "Preparedness";
  const weakestTab = WEAKEST_TAB[weakest.key] ?? "safety";

  const first = trail[0] ?? null;
  const latest = trail.at(-1) ?? null;
  const runChange =
    first && latest && trail.length >= 2
      ? latest.netWorthCents - first.netWorthCents
      : null;

  const line = view.hasPendingEvent
    ? "A decision is waiting — resolve it first."
    : `Month ${view.monthNumber} — pick your move →`;

  return (
    <div className="hq-screen">
      <div className="hq-mascot-row">
        <Image
          alt={penny.characterName}
          height={60}
          src={penny.characterSrc}
          style={{ width: 60, height: 60, objectFit: "contain" }}
          unoptimized
          width={60}
        />
        <span className="hq-line-pill">{line}</span>
        {view.hasPendingEvent ? (
          <span className="hq-chip" data-tone="negative">
            1 decision waiting
          </span>
        ) : null}
      </div>

      <div className="hq-grid-overview">
        <HqCard
          aside={
            runChange !== null && first ? (
              <span
                className="hq-chip"
                data-tone={runChange >= 0 ? "positive" : "negative"}
              >
                {runChange >= 0 ? "▲" : "▼"} {formatCents(Math.abs(runChange))}{" "}
                since {formatShortMonthLabel(first.month)}
              </span>
            ) : null
          }
          eyebrow="Net worth"
        >
          <div
            className="hq-figure"
            style={{ fontSize: "3.375rem", margin: "0.375rem 0 0.25rem" }}
          >
            {formatCents(view.netWorthCents)}
          </div>
          <TrendChart trail={trail} withSummary={false} />
          <AssetMixBar
            cashCents={view.cashCents}
            debtCents={view.debtCents}
            retirementCents={run.finances.retirementCents}
            taxableCents={run.finances.taxableInvestmentsCents}
          />
        </HqCard>

        <FlowCard taxLoadState={taxLoadState} view={view} />

        <HqCard eyebrow="Safety" style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              margin: "0.625rem 0 0.125rem",
            }}
          >
            <HqRing
              color={BAND_RING_COLOR[view.preparednessBand]}
              label={formatPpmPercent(view.preparednessPpm)}
              percent={view.preparednessPpm / 10_000}
              size={92}
            />
            <div style={{ display: "grid", gap: "0.375rem", justifyItems: "start" }}>
              <span
                className="hq-chip"
                data-tone={BAND_CHIP_TONE[view.preparednessBand]}
                style={{ fontSize: "0.75rem" }}
              >
                {BAND_COPY[view.preparednessBand]}
              </span>
              <span className="hq-chip" style={{ fontSize: "0.75rem" }}>
                Risk {formatPpmPercent(view.riskPpm)}
              </span>
            </div>
          </div>
          <div style={{ marginTop: "auto", paddingTop: "0.625rem" }}>
            <button
              className="hq-topbar-action"
              onClick={() => onSelectTab(weakestTab)}
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                textAlign: "left",
                border: "2px solid var(--hq-gold-border)",
                background: "var(--hq-gold-soft)",
                color: "var(--hq-gold-ink)",
              }}
              type="button"
            >
              <span>Weak spot: {weakestLabel}</span>
              <b>Fix →</b>
            </button>
          </div>
        </HqCard>
      </div>
    </div>
  );
}

type FlowCardProps = Readonly<{
  view: HqView;
  taxLoadState: TaxLoadState | undefined;
}>;

/**
 * One month of money in motion. "In" is the tax engine's modeled take-home;
 * bills and the requested allocation are the same figures Budget and Invest
 * show, so the leftover line is honest arithmetic, not a new estimate.
 */
function FlowCard({ view, taxLoadState }: FlowCardProps) {
  const takeHomeCents =
    taxLoadState?.status === "ready"
      ? taxLoadState.summary.paycheckEstimate.afterTaxCashIncomeCents
      : null;
  const billsCents = view.monthlyRequiredCents;
  const futureCents =
    view.buckets.lockedMonthlyCents -
    view.buckets.employerMatchMonthlyCents +
    view.buckets.taxableMonthlyCents +
    view.buckets.extraDebtMonthlyCents;
  const matchCents = view.buckets.employerMatchMonthlyCents;
  const scale = Math.max(takeHomeCents ?? 0, billsCents, futureCents, 1);
  const leftoverCents =
    takeHomeCents === null ? null : takeHomeCents - billsCents - futureCents;

  if (view.monthlyGrossSalaryCents === null) {
    return (
      <HqCard eyebrow={`${view.shortMonthLabel} flow`}>
        <p className="hq-unavailable" style={{ marginTop: "0.625rem" }}>
          No employment income this month, so there is no paycheck to split.
          Bills of {formatCents(billsCents)} still come due.
        </p>
      </HqCard>
    );
  }

  return (
    <HqCard eyebrow={`${view.shortMonthLabel} flow`}>
      <div style={{ display: "grid", gap: "0.75rem", marginTop: "0.75rem" }}>
        <FlowRow
          amount={takeHomeCents === null ? "estimating…" : formatCents(takeHomeCents)}
          color="var(--hq-green)"
          label="In"
          valueColor="var(--hq-green-deep)"
          width={takeHomeCents === null ? 0 : (takeHomeCents / scale) * 100}
        />
        <FlowRow
          amount={`−${formatCents(billsCents)}`}
          color="var(--hq-red-light)"
          label="Bills"
          valueColor="var(--hq-red)"
          width={(billsCents / scale) * 100}
        />
        <FlowRow
          amount={`−${formatCents(futureCents)}`}
          color="var(--hq-blue-bright)"
          label="Future"
          valueColor="var(--hq-blue)"
          width={(futureCents / scale) * 100}
        />
      </div>
      <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.875rem" }}>
        {leftoverCents !== null ? (
          <HqBanner
            label={leftoverCents >= 0 ? "LEFT OVER" : "SHORT"}
            tone={leftoverCents >= 0 ? "positive" : "negative"}
            value={formatCents(Math.abs(leftoverCents))}
          />
        ) : (
          <p className="hq-unavailable" style={{ margin: 0 }}>
            {taxLoadState?.status === "error"
              ? "The take-home estimate could not be loaded."
              : "Estimating take-home with the tax engine…"}
          </p>
        )}
        {matchCents > 0 ? (
          <HqBanner
            label="⚡ FREE MATCH"
            tone="gold"
            value={`+${formatCents(matchCents)}`}
          />
        ) : null}
      </div>
    </HqCard>
  );
}

type FlowRowProps = Readonly<{
  label: string;
  amount: string;
  width: number;
  color: string;
  valueColor: string;
}>;

function FlowRow({ label, amount, width, color, valueColor }: FlowRowProps) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          font: "800 0.8125rem var(--hq-body-font)",
        }}
      >
        <span style={{ color: "var(--hq-muted)" }}>{label}</span>
        <b style={{ color: valueColor }}>{amount}</b>
      </div>
      <div className="hq-meter" data-size="lg" style={{ marginTop: 3 }}>
        <div
          className="hq-meter-fill"
          style={{
            width: `${Math.max(0, Math.min(100, width))}%`,
            background: color,
          }}
        />
      </div>
    </div>
  );
}

type AssetMixProps = Readonly<{
  cashCents: number;
  retirementCents: number;
  taxableCents: number;
  debtCents: number;
}>;

/** One stacked bar showing where the money sits, with debt as its own chip. */
function AssetMixBar({ cashCents, retirementCents, taxableCents, debtCents }: AssetMixProps) {
  const segments = [
    { key: "cash", cents: cashCents },
    { key: "retirement", cents: retirementCents },
    { key: "taxable", cents: taxableCents },
  ] as const;
  const totalAssets = segments.reduce(
    (sum, segment) => sum + Math.max(0, segment.cents),
    0,
  );

  return (
    <div className="hq-mix" style={{ marginTop: "0.5rem" }}>
      {totalAssets > 0 ? (
        <div aria-hidden="true" className="hq-mix-track">
          {segments
            .filter((segment) => segment.cents > 0)
            .map((segment) => (
              <i
                className="hq-mix-seg"
                data-part={segment.key}
                key={segment.key}
                style={{ width: `${(segment.cents / totalAssets) * 100}%` }}
              />
            ))}
        </div>
      ) : null}
      <div className="hq-chip-row" style={{ marginTop: "0.25rem" }}>
        {segments.map((segment) => (
          <span className="hq-chip" key={segment.key}>
            <i className="hq-mix-dot" data-part={segment.key} />
            {formatCents(segment.cents)}
          </span>
        ))}
        {debtCents > 0 ? (
          <span className="hq-chip" data-tone="negative">
            <i className="hq-mix-dot" data-part="debt" />−{formatCents(debtCents)}
          </span>
        ) : (
          <span className="hq-chip" data-tone="positive">
            Debt free
          </span>
        )}
      </div>
    </div>
  );
}
