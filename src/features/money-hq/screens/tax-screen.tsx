"use client";

import type { TaxSummaryResponse } from "@/contracts/api/contracts";

import { hqTab, type HqTabId } from "../hq-tabs";
import { HqCard, HqLedger, HqSpeech, HqUnavailable } from "../hq-ui";
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

  return (
    <div className="hq-screen">
      <div className="hq-screen-head">
        <HqSpeech
          characterName={luckyCat.characterName}
          characterSrc={luckyCat.characterSrc}
        >
          Taxes are not one mystery fee. Here is your modeled federal, state,
          and payroll tax — before you commit another month.
        </HqSpeech>
        <div className="hq-planbar-spacer" />
        <span className="hq-chip">
          {summary.jurisdiction.stateCode} · {summary.jurisdiction.economicYear}
        </span>
      </div>

      <div className="hq-columns">
        <div className="hq-column">
          <HqCard
            aside={
              <span className="hq-chip" data-tone="caution">
                {formatPpmPercent(paycheck.effectiveTaxRatePpm)} effective
              </span>
            }
            eyebrow="Your next modeled paycheck"
          >
            <HqLedger
              entries={[
                {
                  label: "Gross employment income",
                  value: formatCents(paycheck.grossIncomeCents),
                  tone: "positive",
                },
                {
                  label: "Traditional 401(k) contribution",
                  value: deduction(paycheck.employee401kContributionCents),
                  tone: "neutral",
                },
                {
                  label: "HSA contribution",
                  value: deduction(paycheck.employeeHsaContributionCents),
                  tone: "neutral",
                },
                {
                  label: "Federal income tax",
                  value: deduction(paycheck.federalIncomeTaxCents),
                  tone: "negative",
                },
                {
                  label: "State income tax",
                  value: deduction(paycheck.stateIncomeTaxCents),
                  tone: paycheck.stateIncomeTaxCents === 0 ? "neutral" : "negative",
                },
                {
                  label: "Social Security + Medicare",
                  value: deduction(paycheck.employeePayrollTaxCents),
                  tone: "negative",
                },
                ...(paycheck.selfEmploymentTaxCents === 0
                  ? []
                  : [{
                      label: "Self-employment tax",
                      value: deduction(paycheck.selfEmploymentTaxCents),
                      tone: "negative" as const,
                    }]),
                {
                  label: "Total modeled tax",
                  value: deduction(paycheck.totalTaxCents),
                  tone: "negative",
                  total: true,
                },
                {
                  label: "Modeled take-home cash",
                  value: formatCents(paycheck.afterTaxCashIncomeCents),
                  tone: "positive",
                  total: true,
                },
              ]}
            />
            <p className="hq-note">
              A traditional 401(k) and an eligible HSA reduce modeled taxable
              income now; they do not make the contribution free.
            </p>
          </HqCard>

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
        </div>

        <div className="hq-column">
          <HqCard eyebrow="Year to date · ledger-backed">
            <HqLedger
              entries={[
                { label: "Paychecks processed", value: String(ytd.paychecksProcessed) },
                { label: "Gross income received", value: formatCents(ytd.grossIncomeCents) },
                { label: "401(k) contributions", value: formatCents(ytd.employee401kContributionCents) },
                { label: "HSA contributions", value: formatCents(ytd.employeeHsaContributionCents) },
                {
                  label: "Tax recorded",
                  value: deduction(ytd.totalTaxCents),
                  tone: ytd.totalTaxCents === 0 ? "neutral" : "negative",
                },
                {
                  label: "After-tax cash income",
                  value: formatCents(ytd.afterTaxCashIncomeCents),
                  tone: "positive",
                  total: true,
                },
              ]}
            />
            <p className="hq-note">
              This card reads completed payroll transactions. The paycheck card
              is a forward estimate using your current choices.
            </p>
          </HqCard>

          <HqCard eyebrow="Filing and state context">
            <HqLedger
              entries={[
                { label: "Filing status", value: FILING_STATUS_LABELS[summary.jurisdiction.filingStatus] },
                { label: "State", value: summary.jurisdiction.stateCode },
                {
                  label: "Annual modeled state income tax",
                  value: formatCents(summary.stateContext.annualStateIncomeTaxCents),
                  tone: summary.stateContext.hasModeledStateIncomeTax ? "negative" : "positive",
                },
                {
                  label: "Difference from a no-income-tax state",
                  value: formatCents(summary.stateContext.differenceFromNoIncomeTaxStateCents),
                },
              ]}
            />
            <p className="hq-note" data-tone="caution">
              {summary.stateContext.explanation}
            </p>
          </HqCard>

          <HqCard eyebrow="Projected refund or amount due">
            <div className="hq-chip-row">
              <span className="hq-chip" data-tone="positive">
                Refund {formatCents(summary.settlement.projectedRefundCents)}
              </span>
              <span className="hq-chip">
                Amount due {formatCents(summary.settlement.projectedAmountDueCents)}
              </span>
            </div>
            <p className="hq-note">{summary.settlement.explanation}</p>
          </HqCard>

          <HqCard accent="gold" eyebrow="What can you change?">
            <p className="hq-note">
              Your salary, filing status, state, and pre-tax contribution choices
              shape this estimate. Investment gains and itemized deductions are
              not modeled in this version.
            </p>
            <button
              className="hq-topbar-action"
              onClick={() => onSelectTab("invest")}
              type="button"
            >
              Adjust 401(k) or HSA →
            </button>
          </HqCard>
        </div>
      </div>

      <p className="hq-note" style={{ margin: "0.75rem 0 0" }}>
        {annual.disclaimer} Policy bundle {summary.model.bundleVersion}; rules {summary.model.rulesVersion}
        {summary.model.projectedFromFrozenPolicy ? " (projected from frozen policy)." : "."}
      </p>
    </div>
  );
}
