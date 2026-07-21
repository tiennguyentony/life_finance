"use client";

import type { TaxSummaryResponse } from "@/contracts/api/contracts";

import { HqRing } from "../hq-chrome";
import { hqTab, type HqTabId } from "../hq-tabs";
import {
  HqCard,
  HqLedger,
  HqMiniTile,
  HqScreenHead,
  HqSpeech,
  HqUnavailable,
} from "../hq-ui";
import { formatCents, formatPpmPercent } from "../hq-view";

export type TaxLoadState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "loading" }>
  | Readonly<{ status: "error"; message: string }>
  | Readonly<{ status: "ready"; summary: TaxSummaryResponse }>;

type Props = Readonly<{
  loadState: TaxLoadState;
  onRetry: () => void;
  onSelectTab: (tab: HqTabId) => void;
}>;

const FILING_STATUS_LABELS: Readonly<
  Record<TaxSummaryResponse["jurisdiction"]["filingStatus"], string>
> = {
  single: "Single",
  married_filing_jointly: "Married filing jointly",
  married_filing_separately: "Married filing separately",
  head_of_household: "Head of household",
  qualifying_surviving_spouse: "Qualifying surviving spouse",
};

function deduction(value: number): string {
  return value === 0 ? "$0" : `−${formatCents(value)}`;
}

export function TaxScreen({ loadState, onRetry, onSelectTab }: Props) {
  const luckyCat = hqTab("tax");

  if (loadState.status === "idle" || loadState.status === "loading") {
    return (
      <div className="hq-screen">
        <div className="hq-screen-head">
          <HqSpeech
            characterName={luckyCat.characterName}
            characterSrc={luckyCat.characterSrc}
          >
            I&rsquo;m reconciling your salary, pre-tax choices, filing status, and
            state rules with the same tax engine used when a month closes.
          </HqSpeech>
        </div>
        <HqCard eyebrow="Tax estimate">
          <HqUnavailable>Calculating your current tax picture…</HqUnavailable>
        </HqCard>
      </div>
    );
  }

  if (loadState.status === "error") {
    return (
      <div className="hq-screen">
        <div className="hq-screen-head">
          <HqSpeech
            characterName={luckyCat.characterName}
            characterSrc={luckyCat.characterSrc}
          >
            I couldn&rsquo;t load the estimate. Your saved game is safe, and no
            month or decision was changed.
          </HqSpeech>
        </div>
        <HqCard eyebrow="Tax estimate unavailable">
          <p className="hq-note" data-tone="negative">
            {loadState.message}
          </p>
          <button className="hq-button" onClick={onRetry} type="button">
            Try the estimate again
          </button>
        </HqCard>
      </div>
    );
  }

  const { summary } = loadState;
  const paycheck = summary.paycheckEstimate;
  const annual = summary.annualEstimate;
  const ytd = summary.yearToDate;
  const gross = Math.max(1, paycheck.grossIncomeCents);
  const refund = summary.settlement.projectedRefundCents;
  const due = summary.settlement.projectedAmountDueCents;

  return (
    <div className="hq-screen">
      <HqScreenHead
        characterName={luckyCat.characterName}
        characterSrc={luckyCat.characterSrc}
        line="Every fee, named."
        title="Tax"
      >
        <span className="hq-chip">{summary.jurisdiction.stateCode}</span>
        <span className="hq-chip">
          {FILING_STATUS_LABELS[summary.jurisdiction.filingStatus]}
        </span>
        {refund > 0 ? (
          <span className="hq-chip" data-tone="positive">
            Refund {formatCents(refund)}
          </span>
        ) : due > 0 ? (
          <span className="hq-chip" data-tone="negative">
            Due {formatCents(due)}
          </span>
        ) : null}
      </HqScreenHead>

      <div className="hq-columns">
        <HqCard
          aside={
            <span className="hq-chip" data-tone="caution">
              {formatPpmPercent(paycheck.effectiveTaxRatePpm)} effective
            </span>
          }
          eyebrow="Your next modeled paycheck"
        >
          <div style={{ display: "grid", gap: "0.5rem", marginTop: "0.625rem" }}>
            <PaycheckBar
              amount={formatCents(paycheck.grossIncomeCents)}
              color="var(--hq-green)"
              label="Gross"
              width={100}
            />
            {paycheck.employee401kContributionCents > 0 ? (
              <PaycheckBar
                amount={deduction(paycheck.employee401kContributionCents)}
                amountColor="var(--hq-blue)"
                color="var(--hq-blue-bright)"
                label="401(k)"
                width={(paycheck.employee401kContributionCents / gross) * 100}
              />
            ) : null}
            {paycheck.employeeHsaContributionCents > 0 ? (
              <PaycheckBar
                amount={deduction(paycheck.employeeHsaContributionCents)}
                amountColor="var(--hq-blue)"
                color="var(--hq-blue-bright)"
                label="HSA"
                width={(paycheck.employeeHsaContributionCents / gross) * 100}
              />
            ) : null}
            <PaycheckBar
              amount={deduction(paycheck.totalTaxCents)}
              amountColor="var(--hq-red)"
              color="var(--hq-red-bright)"
              label="Tax"
              width={(paycheck.totalTaxCents / gross) * 100}
            />
            <div
              className="hq-bar-row"
              style={{ paddingTop: 6, borderTop: "1.5px dashed var(--hq-line)" }}
            >
              <span className="hq-bar-row-label" style={{ color: "var(--hq-ink)" }}>
                You keep
              </span>
              <div className="hq-bar-track" style={{ height: 26 }}>
                <div
                  className="hq-bar-fill"
                  style={{
                    width: `${(paycheck.afterTaxCashIncomeCents / gross) * 100}%`,
                    background: "linear-gradient(90deg, var(--hq-green), #5ecb8b)",
                    display: "grid",
                    placeItems: "center",
                    font: "800 0.75rem var(--hq-body-font)",
                    color: "#fff",
                  }}
                >
                  {formatCents(paycheck.afterTaxCashIncomeCents)}
                </div>
              </div>
              <b
                className="hq-bar-row-value"
                style={{ color: "var(--hq-green-deep)", fontSize: "0.9375rem" }}
              >
                {formatCents(paycheck.afterTaxCashIncomeCents)}
              </b>
            </div>
          </div>

          <div className="hq-chip-row" style={{ marginTop: "0.625rem" }}>
            <span className="hq-chip" data-tone="negative">
              Federal {formatCents(paycheck.federalIncomeTaxCents)}
            </span>
            <span
              className="hq-chip"
              data-tone={paycheck.stateIncomeTaxCents === 0 ? undefined : "negative"}
            >
              State {formatCents(paycheck.stateIncomeTaxCents)}
            </span>
            <span className="hq-chip" data-tone="negative">
              Social Security + Medicare {formatCents(paycheck.employeePayrollTaxCents)}
            </span>
            {paycheck.selfEmploymentTaxCents > 0 ? (
              <span className="hq-chip" data-tone="negative">
                Self-employment {formatCents(paycheck.selfEmploymentTaxCents)}
              </span>
            ) : null}
          </div>
          <p className="hq-note" style={{ marginTop: "0.625rem" }}>
            A traditional 401(k) and an eligible HSA reduce modeled taxable
            income now; they do not make the contribution free.
          </p>
        </HqCard>

        <div className="hq-column">
          <HqCard>
            <div style={{ display: "flex", alignItems: "center", gap: "0.875rem" }}>
              <HqRing
                color="var(--hq-gold)"
                label={formatPpmPercent(paycheck.effectiveTaxRatePpm)}
                percent={paycheck.effectiveTaxRatePpm / 10_000}
                size={92}
              />
              <div>
                <div style={{ font: "800 0.9375rem var(--hq-display)" }}>
                  of pay goes to tax
                </div>
                <div style={{ font: "700 0.6875rem var(--hq-body-font)", color: "var(--hq-soft)" }}>
                  {formatCents(annual.annualTotalTaxCents)} / year
                </div>
              </div>
            </div>
            <div className="hq-eyebrow" style={{ margin: "0.75rem 0 0.375rem" }}>
              Year to date · ledger-backed
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "0.5rem",
              }}
            >
              <HqMiniTile
                label="YTD kept"
                value={formatCents(ytd.afterTaxCashIncomeCents)}
                valueTone="positive"
              />
              <HqMiniTile
                label="YTD tax"
                value={ytd.totalTaxCents === 0 ? "$0" : formatCents(ytd.totalTaxCents)}
                valueTone={ytd.totalTaxCents === 0 ? undefined : "negative"}
              />
            </div>
            <div className="hq-chip-row">
              <span className="hq-chip">
                {ytd.paychecksProcessed} paychecks processed
              </span>
            </div>
            <button
              className="hq-topbar-action"
              onClick={() => onSelectTab("invest")}
              style={{ width: "100%", textAlign: "center", marginTop: "0.625rem" }}
              type="button"
            >
              Lower it — Adjust 401(k) or HSA →
            </button>
          </HqCard>

          <HqCard eyebrow="Projected refund or amount due">
            <div className="hq-chip-row" style={{ marginTop: 0 }}>
              <span className="hq-chip" data-tone="positive">
                Refund {formatCents(refund)}
              </span>
              <span className="hq-chip">Amount due {formatCents(due)}</span>
            </div>
            <p className="hq-note" style={{ marginTop: "0.5rem" }}>
              {summary.settlement.explanation}
            </p>
          </HqCard>
        </div>
      </div>

      <div className="hq-columns">
        <HqCard eyebrow={`${summary.jurisdiction.economicYear} annual estimate`}>
          <HqLedger
            entries={[
              {
                label: "Annual gross income",
                value: formatCents(annual.annualGrossIncomeCents),
                tone: "positive",
              },
              ...(annual.annualTaxableIncomeCents === null
                ? []
                : [{
                    label: "Modeled taxable income",
                    value: formatCents(annual.annualTaxableIncomeCents),
                    tone: "neutral" as const,
                  }]),
              {
                label: "Federal income tax",
                value: deduction(annual.annualFederalIncomeTaxCents),
                tone: "negative",
              },
              {
                label: "State income tax",
                value: deduction(annual.annualStateIncomeTaxCents),
                tone: annual.annualStateIncomeTaxCents === 0 ? "neutral" : "negative",
              },
              {
                label: "Employee payroll tax",
                value: deduction(annual.annualEmployeePayrollTaxCents),
                tone: "negative",
              },
              {
                label: "Total annual tax",
                value: deduction(annual.annualTotalTaxCents),
                tone: "negative",
                total: true,
              },
              {
                label: "Annual income after modeled tax",
                value: formatCents(annual.annualAfterTaxIncomeCents),
                tone: "positive",
                total: true,
              },
            ]}
          />
        </HqCard>

        <HqCard eyebrow="Filing and state context">
          <HqLedger
            entries={[
              {
                label: "Filing status",
                value: FILING_STATUS_LABELS[summary.jurisdiction.filingStatus],
              },
              { label: "State", value: summary.jurisdiction.stateCode },
              {
                label: "Annual modeled state income tax",
                value: formatCents(summary.stateContext.annualStateIncomeTaxCents),
                tone: summary.stateContext.hasModeledStateIncomeTax
                  ? "negative"
                  : "positive",
              },
              {
                label: "Difference from a no-income-tax state",
                value: formatCents(
                  summary.stateContext.differenceFromNoIncomeTaxStateCents,
                ),
              },
            ]}
          />
          <p className="hq-note" data-tone="caution">
            {summary.stateContext.explanation}
          </p>
        </HqCard>
      </div>

      <p className="hq-note" style={{ margin: "0.25rem 0 0" }}>
        {annual.disclaimer} Policy bundle {summary.model.bundleVersion}; rules {summary.model.rulesVersion}
        {summary.model.projectedFromFrozenPolicy ? " (projected from frozen policy)." : "."}
      </p>
    </div>
  );
}

type PaycheckBarProps = Readonly<{
  label: string;
  amount: string;
  amountColor?: string;
  width: number;
  color: string;
}>;

function PaycheckBar({ label, amount, amountColor, width, color }: PaycheckBarProps) {
  return (
    <div className="hq-bar-row">
      <span className="hq-bar-row-label">{label}</span>
      <div className="hq-bar-track">
        <div
          className="hq-bar-fill"
          style={{ width: `${Math.max(0.5, Math.min(100, width))}%`, background: color }}
        />
      </div>
      <b className="hq-bar-row-value" style={amountColor ? { color: amountColor } : undefined}>
        {amount}
      </b>
    </div>
  );
}
