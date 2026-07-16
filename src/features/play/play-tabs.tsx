"use client";

import { useEffect, useRef, useState } from "react";

import { cycleTab } from "./play-support";

/**
 * ARIA tabs pattern with a sliding selection pill. The pill is measured from
 * the DOM so it can translate between labels; until measured (or without JS)
 * a CSS fallback tints the selected tab instead.
 */
export function PlayTabs<T extends string>({
  tabs,
  labels,
  value,
  onChange,
  listLabel,
}: Readonly<{
  tabs: readonly T[];
  labels: Readonly<Record<T, string>>;
  value: T;
  onChange: (next: T) => void;
  listLabel: string;
}>) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [indicator, setIndicator] = useState<{
    left: number;
    width: number;
  } | null>(null);

  useEffect(() => {
    const measure = () => {
      const active = listRef.current?.querySelector<HTMLButtonElement>(
        '[aria-selected="true"]',
      );
      if (!active) return;
      setIndicator({ left: active.offsetLeft, width: active.offsetWidth });
    };
    measure();
    document.fonts?.ready.then(measure).catch(() => {});
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [value]);

  const handleKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const next = cycleTab(tabs, value, event.key);
    if (next === value) return;
    event.preventDefault();
    onChange(next);
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLButtonElement>(`#tab-${next}`)
        ?.focus();
    });
  };

  return (
    <div
      aria-label={listLabel}
      className="play-tabs"
      onKeyDown={handleKeys}
      ref={listRef}
      role="tablist"
    >
      <span
        aria-hidden="true"
        className="seg-indicator"
        data-ready={indicator ? "" : undefined}
        style={
          indicator
            ? {
                transform: `translateX(${indicator.left}px)`,
                width: `${indicator.width}px`,
              }
            : undefined
        }
      />
      {tabs.map((item) => (
        <button
          aria-controls={`panel-${item}`}
          aria-selected={value === item}
          className="seg-tab"
          id={`tab-${item}`}
          key={item}
          onClick={() => onChange(item)}
          role="tab"
          tabIndex={value === item ? 0 : -1}
          type="button"
        >
          {labels[item]}
        </button>
      ))}
    </div>
  );
}
