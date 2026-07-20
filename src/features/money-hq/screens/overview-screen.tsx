"use client";

import Image from "next/image";

import type { RunViewWire } from "@/contracts/api/contracts";
import { EDUCATION_CONCEPTS } from "@/features/money-hq/hq-concepts";

import { HqCard, HqMeter } from "../hq-ui";
import type { TrailPoint } from "../run-trail";
import { TrendChart } from "../trend-chart";
import { hqTab, type HqTabId } from "../hq-tabs";
import {
  formatCents,
  formatMonths,
  formatPpmPercent,
  type HqView,
} from "../hq-view";

const BAND_COPY: Readonly<Record<RunViewWire["preparedness"]["band"], string>> = {
  critical: "Critical",
  exposed: "Exposed",
  stable: "Stable",
  resilient: "Resilient",
};

/** Keyed by the preparedness component field names the wire reports. */
const WEAKEST_COPY: Readonly<Record<string, string>> = {
  liquidityPpm: "emergency fund",
  cashFlowPpm: "monthly cash flow",
  debtPpm: "debt load",
  insurancePpm: "insurance cover",
  diversificationPpm: "investment mix",
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
}>;

export function OverviewScreen({ run, view, trail, onSelectTab }: Props) {
  const penny = hqTab("overview");
  const bengo = hqTab("invest");
  const weakest = weakestComponent(run.preparedness.components);
  const weakestLabel = WEAKEST_COPY[weakest.key] ?? "preparedness";
  const weakestTab = WEAKEST_TAB[weakest.key] ?? "safety";
  // The lesson rotates with the run's own weakest area rather than a fixed pick.
  const lesson =
    EDUCATION_CONCEPTS.find(({ id }) => id === lessonIdFor(weakest.key)) ??
    EDUCATION_CONCEPTS[0];

  return (
    <div className="hq-screen">
      <div className="hq-screen-head">
        <Image
          alt={penny.characterName}
          className="hq-character"
          height={88}
          src={penny.characterSrc}
          unoptimized
          width={88}
        />
        <p className="hq-speech">
          Welcome back, Sprout! It&rsquo;s {view.shortMonthLabel} — month{" "}
          {view.monthNumber}.{" "}
          {view.hasPendingEvent
            ? "A decision is waiting before you can plan again."
            : "Pick a tab to shape this month's plan."}
        </p>
        <div className="hq-planbar-spacer" />
        {view.hasPendingEvent ? (
          <span className="hq-chip" data-tone="negative">
            1 decision waiting
          </span>
        ) : null}
      </div>

      <div className="hq-columns">
        <div className="hq-column">
          <HqCard eyebrow="Net worth">
            <div className="hq-figure">{formatCents(view.netWorthCents)}</div>
            <AssetMixBar
              cashCents={view.cashCents}
              debtCents={view.debtCents}
              retirementCents={run.finances.retirementCents}
              taxableCents={run.finances.taxableInvestmentsCents}
            />
            <TrendChart trail={trail} />
          </HqCard>

          <HqCard eyebrow="This month at a glance">
            <div
              style={{
                display: "grid",
                gap: "0.625rem",
                gridTemplateColumns: "repeat(auto-fit, minmax(9rem, 1fr))",
              }}
            >
              <GlanceTile
                caption="before tax"
                label="Gross pay"
                tone="positive"
                value={
                  view.monthlyGrossSalaryCents === null
                    ? "No salary"
                    : formatCents(view.monthlyGrossSalaryCents)
                }
              />
              <GlanceTile
                caption="rent, food, insurance, debt minimums"
                label="Required each month"
                tone="neutral"
                value={`−${formatCents(view.monthlyRequiredCents)}`}
              />
              <GlanceTile
                caption="rate illustration; actual shown after month close"
                label="Requested allocation"
                tone="blue"
                value={`≈${formatCents(
                  view.buckets.lockedMonthlyCents -
                    view.buckets.employerMatchMonthlyCents +
                    view.buckets.taxableMonthlyCents +
                    view.buckets.extraDebtMonthlyCents,
                )}`}
              />
              <GlanceTile
                caption="free money, on top of your pay"
                label="Employer match"
                tone="gold"
                value={`≈+${formatCents(view.buckets.employerMatchMonthlyCents)}`}
              />
            </div>
          </HqCard>
        </div>

        <div className="hq-column">
          <HqCard eyebrow="Quest · financial independence">
            <div className="hq-figure" style={{ fontSize: "1.375rem" }}>
              {formatCents(view.goalCurrentCents)}{" "}
              <span className="hq-figure-unit">
                of {formatCents(view.goalTargetCents)}
              </span>
            </div>
            <div className="hq-meter" data-size="lg">
              <div
                className="hq-meter-fill"
                data-tone="goal"
                style={{
                  width: `${Math.max(1, Math.min(100, view.goalProgressPpm / 10_000))}%`,
                }}
              />
            </div>
            <p className="hq-nav-hint" style={{ marginTop: "0.375rem" }}>
              {formatPpmPercent(view.goalProgressPpm, 1)} there · target is{" "}
              {(1_000_000 / run.goal.safeWithdrawalRatePpm).toFixed(0)}× your
              chosen annual spending
            </p>
          </HqCard>

          <HqCard eyebrow="How safe is Sprout?">
            <HqMeter
              label="Preparedness"
              percent={view.preparednessPpm / 10_000}
              tone="positive"
              valueLabel={`${formatPpmPercent(view.preparednessPpm)} · ${
                BAND_COPY[view.preparednessBand]
              }`}
            />
            <HqMeter
              label="Risk exposure"
              percent={view.riskPpm / 10_000}
              tone="caution"
              valueLabel={formatPpmPercent(view.riskPpm)}
            />
            <p className="hq-note" data-tone="caution">
              Weakest spot: <b>{weakestLabel}</b>
              {/* The runway figure only explains a liquidity weakness. */}
              {view.emergencyFundMonths !== null && weakest.key === "liquidityPpm"
                ? ` — you hold ${formatMonths(view.emergencyFundMonths)} of required spending.`
                : "."}{" "}
              <button
                className="hq-topbar-action"
                onClick={() => onSelectTab(weakestTab)}
                style={{ padding: "0.125rem 0.5rem", boxShadow: "none" }}
                type="button"
              >
                Visit {hqTab(weakestTab).label} →
              </button>
            </p>
          </HqCard>

          {lesson ? (
            <HqCard accent="green">
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                <Image
                  alt=""
                  height={56}
                  src={bengo.characterSrc}
                  style={{ objectFit: "contain" }}
                  unoptimized
                  width={56}
                />
                <div>
                  <div
                    className="hq-eyebrow"
                    style={{ color: "var(--hq-green-deep)" }}
                  >
                    Lesson of the month
                  </div>
                  <div style={{ font: "800 1.0625rem var(--hq-display)" }}>
                    {lesson.title}
                  </div>
                </div>
              </div>
              <p
                style={{
                  font: "600 0.78125rem var(--hq-body-font)",
                  color: "var(--hq-body)",
                  lineHeight: 1.5,
                  margin: 0,
                }}
              >
                {lesson.shortDefinition}
              </p>
              <button
                className="hq-topbar-action"
                onClick={() => onSelectTab("glossary")}
                style={{ marginTop: "0.25rem", padding: "0.25rem 0.75rem" }}
                type="button"
              >
                Full story in the field guide
              </button>
            </HqCard>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function lessonIdFor(weakestKey: string): string {
  switch (weakestKey) {
    case "liquidityPpm":
      return "emergency_fund";
    case "cashFlowPpm":
      return "lifestyle_creep";
    case "debtPpm":
      return "dti";
    case "insurancePpm":
      return "deductible";
    case "diversificationPpm":
      return "diversification";
    default:
      return "compounding";
  }
}

type AssetMixProps = Readonly<{
  cashCents: number;
  retirementCents: number;
  taxableCents: number;
  debtCents: number;
}>;

/** One stacked bar showing where the money sits, with debt on its own track. */
function AssetMixBar({ cashCents, retirementCents, taxableCents, debtCents }: AssetMixProps) {
  const segments = [
    { key: "cash", label: "Cash", cents: cashCents },
    { key: "retirement", label: "Retirement", cents: retirementCents },
    { key: "taxable", label: "Taxable funds", cents: taxableCents },
  ] as const;
  const totalAssets = segments.reduce(
    (sum, segment) => sum + Math.max(0, segment.cents),
    0,
  );

  return (
    <div className="hq-mix">
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
      {debtCents > 0 && totalAssets > 0 ? (
        <div aria-hidden="true" className="hq-mix-track" data-kind="debt">
          <i
            className="hq-mix-seg"
            data-part="debt"
            style={{
              width: `${Math.min(100, (debtCents / totalAssets) * 100)}%`,
            }}
          />
        </div>
      ) : null}
      <div className="hq-chip-row">
        {segments.map((segment) => (
          <span className="hq-chip" key={segment.key}>
            <i className="hq-mix-dot" data-part={segment.key} />
            {segment.label} {formatCents(segment.cents)}
          </span>
        ))}
        {debtCents > 0 ? (
          <span className="hq-chip" data-tone="negative">
            <i className="hq-mix-dot" data-part="debt" />
            Debt -{formatCents(debtCents)}
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

type GlanceProps = Readonly<{
  label: string;
  value: string;
  caption: string;
  tone: "positive" | "neutral" | "blue" | "gold";
}>;

const GLANCE_BACKGROUND: Readonly<Record<GlanceProps["tone"], string>> = {
  positive: "var(--hq-green-soft)",
  neutral: "var(--hq-stage)",
  blue: "var(--hq-blue-soft)",
  gold: "var(--hq-gold-wash)",
};

function GlanceTile({ label, value, caption, tone }: GlanceProps) {
  return (
    <div
      style={{
        padding: "0.625rem 0.75rem",
        borderRadius: 14,
        background: GLANCE_BACKGROUND[tone],
      }}
    >
      <div style={{ font: "700 0.65625rem var(--hq-body-font)", color: "var(--hq-muted)" }}>
        {label}
      </div>
      <div style={{ font: "800 1.25rem var(--hq-display)", color: "var(--hq-ink)" }}>
        {value}
      </div>
      <div style={{ font: "600 0.625rem var(--hq-body-font)", color: "var(--hq-muted)" }}>
        {caption}
      </div>
    </div>
  );
}
