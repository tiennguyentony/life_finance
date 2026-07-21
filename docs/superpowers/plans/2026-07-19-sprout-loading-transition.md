# Sprout Loading Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained `/demo/loading-screen` route that renders a deterministic, board-themed, two-second Sprout loading transition for 16:9 recording.

**Architecture:** A dedicated route renders one isolated client component. The component owns only semantic markup and the exact 2000 ms duration constant; a scoped stylesheet imported through the existing global stylesheet owns the animation, responsive composition, shared-token palette, and reduced-motion fallback.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, native CSS keyframes, Vitest, React server rendering for markup tests.

## Global Constraints

- The route is `/demo/loading-screen` and does not change onboarding or board behavior.
- The loop duration is exactly 2000 milliseconds.
- The primary recording composition is 1920 by 1080 in a 16:9 landscape viewport.
- Visible colors use only the existing `--paper`, `--paper-deep`, `--ink`, `--blue`, `--lime`, `--coral`, `--gold`, and `--white` tokens.
- Reuse the existing Sprout `thinking` artwork and component.
- Do not add navigation, controls, laptop chrome, HUD elements, data fetching, timers, dependencies, or runtime state.
- The first and final frames use the same cream-and-blue glow to hide the loop boundary.
- Reduced motion keeps Sprout and the status readable without looping movement.

---

### Task 1: Loading transition component

**Files:**
- Create: `src/features/demo/sprout-loading-transition.tsx`
- Create: `src/features/demo/__tests__/sprout-loading-transition.test.tsx`

**Interfaces:**
- Consumes: `Sprout({ emotion: "thinking", priority: true, size: "large" })` from `src/components/sprout.tsx`.
- Produces: `LOADING_TRANSITION_DURATION_MS: 2000` and `SproutLoadingTransition(): JSX.Element`.

- [ ] **Step 1: Write the failing component test**

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  LOADING_TRANSITION_DURATION_MS,
  SproutLoadingTransition,
} from "../sprout-loading-transition";

describe("SproutLoadingTransition", () => {
  it("renders the recordable financial-life loading scene", () => {
    const markup = renderToStaticMarkup(<SproutLoadingTransition />);

    expect(LOADING_TRANSITION_DURATION_MS).toBe(2000);
    expect(markup).toContain("SIMULATING FINANCIAL LIFE...");
    expect(markup).toContain("Sprout thinking very hard");
    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup.match(/class="loading-transition-value /g)).toHaveLength(4);
    expect(markup).toContain("--loading-transition-duration:2000ms");
  });
});
```

- [ ] **Step 2: Run the test and verify the missing component failure**

Run: `pnpm vitest run src/features/demo/__tests__/sprout-loading-transition.test.tsx`

Expected: FAIL because `../sprout-loading-transition` does not exist.

- [ ] **Step 3: Implement the semantic animation component**

```tsx
"use client";

import type { CSSProperties } from "react";

import { Sprout } from "@/components/sprout";

export const LOADING_TRANSITION_DURATION_MS = 2000;

const FINANCIAL_VALUES = [
  { label: "$3,840", position: "north-west", tone: "gold" },
  { label: "+$240", position: "north-east", tone: "lime" },
  { label: "-$620", position: "south-west", tone: "coral" },
  { label: "68% FUNDED", position: "south-east", tone: "paper" },
] as const;

type LoadingTransitionStyle = CSSProperties & {
  "--loading-transition-duration": string;
};

export function SproutLoadingTransition() {
  const style: LoadingTransitionStyle = {
    "--loading-transition-duration": `${LOADING_TRANSITION_DURATION_MS}ms`,
  };

  return (
    <section
      aria-label="Financial life simulation loading transition"
      className="loading-transition"
      style={style}
    >
      <div aria-hidden="true" className="loading-transition-wash" />
      <div aria-hidden="true" className="loading-transition-grid" />

      <div aria-hidden="true" className="loading-transition-values">
        {FINANCIAL_VALUES.map(({ label, position, tone }) => (
          <span
            className={`loading-transition-value loading-transition-value-${position} loading-transition-value-${tone}`}
            key={label}
          >
            {label}
          </span>
        ))}
      </div>

      <div className="loading-transition-center">
        <div className="loading-transition-sprout">
          <Sprout emotion="thinking" priority size="large" />
        </div>

        <div className="loading-transition-status" role="status">
          <span>SIMULATING FINANCIAL LIFE...</span>
          <span aria-hidden="true" className="loading-transition-track">
            <i />
          </span>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run the component test and verify it passes**

Run: `pnpm vitest run src/features/demo/__tests__/sprout-loading-transition.test.tsx`

Expected: PASS with one test.

- [ ] **Step 5: Commit the component slice**

```bash
git add src/features/demo/sprout-loading-transition.tsx src/features/demo/__tests__/sprout-loading-transition.test.tsx
git commit -m "Add Sprout loading transition scene"
```

### Task 2: Board-themed animation, demo route, and verification

**Files:**
- Create: `src/app/demo/loading-screen/page.tsx`
- Create: `src/app/styles/loading-transition.css`
- Modify: `src/app/globals.css`
- Create: `src/features/demo/__tests__/loading-transition-styles.test.ts`

**Interfaces:**
- Consumes: `SproutLoadingTransition()` from Task 1 and shared CSS tokens declared in `src/app/globals.css`.
- Produces: Next.js route `/demo/loading-screen` and the scoped `.loading-transition*` CSS contract.

- [ ] **Step 1: Write the failing stylesheet contract test**

```ts
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const globalStyles = readFileSync(
  new URL("../../../app/globals.css", import.meta.url),
  "utf8",
);
const transitionStyles = readFileSync(
  new URL("../../../app/styles/loading-transition.css", import.meta.url),
  "utf8",
);

describe("loading transition styles", () => {
  it("fills the viewport with an exact two-second loop", () => {
    expect(globalStyles).toContain('@import "./styles/loading-transition.css";');
    expect(transitionStyles).toMatch(
      /\.loading-transition\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*0;[\s\S]*?min-height:\s*100dvh;[\s\S]*?overflow:\s*hidden;/,
    );
    expect(transitionStyles).toContain("--loading-transition-duration: 2000ms");
    expect(transitionStyles).toMatch(
      /animation:\s*loading-transition-wash var\(--loading-transition-duration\)[^;]*infinite;/,
    );
  });

  it("uses shared board tokens and provides a stable reduced-motion frame", () => {
    expect(transitionStyles).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(transitionStyles).toContain("var(--paper)");
    expect(transitionStyles).toContain("var(--ink)");
    expect(transitionStyles).toContain("var(--blue)");
    expect(transitionStyles).toContain("var(--lime)");
    expect(transitionStyles).toContain("var(--coral)");
    expect(transitionStyles).toContain("var(--gold)");
    expect(transitionStyles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?animation:\s*none;/,
    );
  });
});
```

- [ ] **Step 2: Run the stylesheet test and verify the missing file failure**

Run: `pnpm vitest run src/features/demo/__tests__/loading-transition-styles.test.ts`

Expected: FAIL because `src/app/styles/loading-transition.css` does not exist.

- [ ] **Step 3: Add the demo route**

```tsx
import type { Metadata } from "next";

import { SproutLoadingTransition } from "@/features/demo/sprout-loading-transition";

export const metadata: Metadata = {
  title: "Sprout Loading Transition",
  description: "A recordable two-second Life Finance loading transition.",
};

export default function LoadingScreenDemoPage() {
  return <SproutLoadingTransition />;
}
```

- [ ] **Step 4: Import the scoped stylesheet in `src/app/globals.css`**

Add this import after the existing board stylesheet import:

```css
@import "./styles/loading-transition.css";
```

- [ ] **Step 5: Implement the complete animation stylesheet**

```css
.loading-transition {
  --loading-transition-duration: 2000ms;
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  min-height: 100dvh;
  overflow: hidden;
  place-items: center;
  background: var(--paper);
  color: var(--ink);
  font-family: "Avenir Next", "Trebuchet MS", sans-serif;
  isolation: isolate;
}

.loading-transition-wash,
.loading-transition-grid,
.loading-transition-values {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.loading-transition-wash {
  inset: 50%;
  width: 140vmax;
  height: 140vmax;
  margin: -70vmax;
  border: 3px solid var(--ink);
  border-radius: 44% 56% 51% 49% / 48% 42% 58% 52%;
  background: var(--blue);
  box-shadow: 12px 14px 0 var(--ink);
  animation: loading-transition-wash var(--loading-transition-duration) cubic-bezier(0.65, 0, 0.35, 1) infinite;
}

.loading-transition-grid {
  z-index: 1;
  background-image:
    linear-gradient(to right, color-mix(in srgb, var(--ink) 14%, transparent) 1px, transparent 1px),
    linear-gradient(to bottom, color-mix(in srgb, var(--ink) 14%, transparent) 1px, transparent 1px);
  background-size: clamp(42px, 4.2vw, 78px) clamp(42px, 4.2vw, 78px);
  opacity: 0;
  animation: loading-transition-grid var(--loading-transition-duration) ease-in-out infinite;
}

.loading-transition-center {
  position: relative;
  z-index: 3;
  display: grid;
  width: min(40vw, 620px);
  justify-items: center;
  gap: clamp(1rem, 2vh, 1.5rem);
  transform: translateY(-1.5vh);
}

.loading-transition-sprout {
  width: min(34vw, 520px);
  opacity: 0;
  animation: loading-transition-sprout var(--loading-transition-duration) cubic-bezier(0.22, 1, 0.36, 1) infinite;
}

.loading-transition-sprout .sprout {
  width: 100%;
  border: 3px solid var(--ink);
  box-shadow: 9px 11px 0 var(--ink);
  animation: none;
}

.loading-transition-status {
  display: grid;
  width: min(34vw, 520px);
  gap: 0.65rem;
  padding: 0.85rem 1rem 1rem;
  border: 3px solid var(--ink);
  border-radius: var(--radius-sm);
  background: var(--white);
  box-shadow: 7px 8px 0 var(--ink);
  opacity: 0;
  animation: loading-transition-status var(--loading-transition-duration) ease-in-out infinite;
}

.loading-transition-status > span:first-child {
  font-family: "Arial Rounded MT Bold", "Avenir Next", sans-serif;
  font-size: clamp(0.72rem, 1vw, 1rem);
  font-weight: 900;
  letter-spacing: 0.08em;
  text-align: center;
}

.loading-transition-track {
  height: 12px;
  overflow: hidden;
  border: 2px solid var(--ink);
  border-radius: 999px;
  background: var(--paper-deep);
}

.loading-transition-track i {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: var(--lime);
  transform: scaleX(0);
  transform-origin: left;
  animation: loading-transition-progress var(--loading-transition-duration) cubic-bezier(0.65, 0, 0.35, 1) infinite;
}

.loading-transition-value {
  position: absolute;
  z-index: 2;
  padding: 0.55rem 0.85rem;
  border: 2px solid var(--ink);
  border-radius: 14px;
  background: var(--white);
  box-shadow: 4px 5px 0 var(--ink);
  font-family: "Arial Rounded MT Bold", "Avenir Next", sans-serif;
  font-size: clamp(0.85rem, 1.35vw, 1.4rem);
  font-weight: 900;
  opacity: 0;
  animation: loading-transition-value var(--loading-transition-duration) steps(1, end) infinite;
}

.loading-transition-value-north-west { top: 18%; left: 13%; transform: rotate(-3deg); }
.loading-transition-value-north-east { top: 23%; right: 14%; transform: rotate(2deg); }
.loading-transition-value-south-west { bottom: 20%; left: 16%; transform: rotate(2deg); }
.loading-transition-value-south-east { right: 12%; bottom: 18%; transform: rotate(-2deg); }
.loading-transition-value-gold { background: var(--gold); }
.loading-transition-value-lime { background: var(--lime); }
.loading-transition-value-coral { background: var(--coral); }
.loading-transition-value-paper { background: var(--white); }

@keyframes loading-transition-wash {
  0%, 100% { opacity: 0.38; transform: scale(0.18) rotate(-7deg); }
  17.5%, 82.5% { opacity: 1; transform: scale(1) rotate(0); }
}

@keyframes loading-transition-grid {
  0%, 12%, 88%, 100% { opacity: 0; }
  24%, 72% { opacity: 1; }
}

@keyframes loading-transition-sprout {
  0%, 14%, 88%, 100% { opacity: 0; transform: translateY(18px) scale(0.94); }
  24%, 78% { opacity: 1; transform: translateY(0) scale(1); }
  46% { opacity: 1; transform: translateY(-6px) scale(1.015); }
}

@keyframes loading-transition-status {
  0%, 30%, 86%, 100% { opacity: 0; transform: translateY(10px); }
  38%, 78% { opacity: 1; transform: translateY(0); }
}

@keyframes loading-transition-progress {
  0%, 34% { transform: scaleX(0); }
  78% { transform: scaleX(1); }
  79%, 100% { transform: scaleX(0); }
}

@keyframes loading-transition-value {
  0%, 19%, 58%, 100% { opacity: 0; }
  23% { opacity: 1; }
  28% { opacity: 0.22; }
  32% { opacity: 1; }
  39% { opacity: 0.38; }
  45% { opacity: 0.95; }
  52% { opacity: 0; }
}

@media (max-width: 900px) {
  .loading-transition-center { width: min(62vw, 540px); }
  .loading-transition-sprout,
  .loading-transition-status { width: min(54vw, 460px); }
  .loading-transition-value-north-west { left: 5%; }
  .loading-transition-value-north-east { right: 5%; }
  .loading-transition-value-south-west { left: 7%; }
  .loading-transition-value-south-east { right: 5%; }
}

@media (prefers-reduced-motion: reduce) {
  .loading-transition-wash,
  .loading-transition-grid,
  .loading-transition-sprout,
  .loading-transition-status,
  .loading-transition-track i,
  .loading-transition-value {
    animation: none;
  }

  .loading-transition-wash { opacity: 1; transform: scale(1); }
  .loading-transition-grid { opacity: 0.5; }
  .loading-transition-sprout,
  .loading-transition-status { opacity: 1; transform: none; }
  .loading-transition-track i { transform: scaleX(0.72); }
  .loading-transition-value { display: none; }
}
```

- [ ] **Step 6: Run focused tests**

Run: `pnpm vitest run src/features/demo/__tests__/sprout-loading-transition.test.tsx src/features/demo/__tests__/loading-transition-styles.test.ts`

Expected: PASS with three tests.

- [ ] **Step 7: Run project verification**

Run: `pnpm lint`

Expected: PASS with no ESLint errors.

Run: `pnpm typecheck`

Expected: PASS with no TypeScript errors.

Run: `pnpm build`

Expected: PASS and include `/demo/loading-screen` in the generated route list.

- [ ] **Step 8: Commit the finished demo**

```bash
git add src/app/demo/loading-screen/page.tsx src/app/styles/loading-transition.css src/app/globals.css src/features/demo/__tests__/loading-transition-styles.test.ts
git commit -m "Build board-themed Sprout loading transition"
```
