"use client";

import { useEffect, useRef } from "react";

import type { BigCityFinancialState } from "@/types/game";

import { formatMoney, formatSignedMoney } from "./game-format";

type FinancialDrawerProps = {
  readonly financial: BigCityFinancialState;
  readonly view: "position" | "cash-flow";
  readonly onClose: () => void;
};

function PositionView({ financial }: { readonly financial: BigCityFinancialState }) {
  return (
    <>
      <div className="finance-drawer-summary">
        <div><span>Net worth</span><strong>{formatMoney(financial.netWorth)}</strong></div>
        <div><span>Liquid resources</span><strong>{formatMoney(financial.portfolio.liquidResources)}</strong></div>
      </div>
      <div className="finance-drawer-columns">
        <section>
          <h3>Assets</h3>
          {financial.portfolio.assets.map((item) => (
            <div className="finance-row" key={item.id}>
              <div><strong>{item.label}</strong><small>{item.note}</small></div>
              <b>{formatMoney(item.value)}</b>
            </div>
          ))}
        </section>
        <section>
          <h3>Liabilities</h3>
          {financial.portfolio.liabilities.map((item) => (
            <div className="finance-row finance-row-debt" key={item.id}>
              <div><strong>{item.label}</strong><small>{item.note}</small></div>
              <b>{formatMoney(item.value)}</b>
            </div>
          ))}
        </section>
      </div>
      <div className="finance-drawer-accounts">
        <section>
          <span>Banking</span>
          <strong>{formatMoney(financial.banking.checking)} checking</strong>
          <small>{formatMoney(financial.banking.highYieldSavings)} in HYSA</small>
        </section>
        <section>
          <span>Investments</span>
          <strong>{formatMoney(financial.investments.brokerageIndexFunds)} index funds</strong>
          <small>{formatMoney(financial.investments.speculativeAssets)} speculative</small>
        </section>
      </div>
    </>
  );
}

function CashFlowView({ financial }: { readonly financial: BigCityFinancialState }) {
  return (
    <>
      <div className="finance-drawer-summary finance-drawer-summary-cash-flow">
        <div><span>Monthly take-home</span><strong>{formatMoney(financial.monthlyTakeHome)}</strong></div>
        <div><span>Unallocated surplus</span><strong>{formatSignedMoney(financial.monthlySurplus)}</strong></div>
      </div>
      <section className="finance-drawer-ledger">
        <h3>Automatic monthly plan</h3>
        {financial.cashFlow.items.map((item) => (
          <div className={`finance-row finance-row-${item.direction}`} key={item.id}>
            <div><strong>{item.label}</strong><small>{item.note}</small></div>
            <b>{item.direction === "in" ? "+" : "-"}{formatMoney(item.value)}</b>
          </div>
        ))}
      </section>
      <p className="finance-drawer-note">Routine bills and allocations run automatically when time advances.</p>
    </>
  );
}

export function FinancialDrawer({ financial, view, onClose }: FinancialDrawerProps) {
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButton.current?.focus();
  }, []);

  return (
    <div className="finance-drawer-backdrop" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section
        aria-labelledby="finance-drawer-title"
        aria-modal="true"
        className="finance-drawer"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
        role="dialog"
      >
        <header>
          <div>
            <span>Big City Survivor</span>
            <h2 id="finance-drawer-title">{view === "position" ? "Financial position" : "Cash flow"}</h2>
          </div>
          <button aria-label="Close financial details" onClick={onClose} ref={closeButton} type="button">Close</button>
        </header>
        {view === "position" ? <PositionView financial={financial} /> : <CashFlowView financial={financial} />}
      </section>
    </div>
  );
}
