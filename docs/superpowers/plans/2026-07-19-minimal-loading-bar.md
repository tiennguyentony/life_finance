# Minimal Loading Bar Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing Sprout loading demo with one centered board-style loading bar on a white screen.

**Architecture:** The existing `/demo/loading-screen` route will render a renamed, isolated client component containing only a semantic progress bar. Its scoped stylesheet will contain one two-second transform animation, shared board tokens, and a reduced-motion fallback.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, native CSS keyframes, Vitest, React static markup tests.

## Global Constraints

- Keep the route at `/demo/loading-screen`.
- Keep the exact 2000 millisecond loop and 16:9 recording target.
- The screen displays only the loading bar on the existing `--white` background.
- Use `--paper-deep` for the track, `--ink` for the outline and hard shadow, and `--lime` for the fill.
- Remove Sprout, status text, financial numbers, grid, blue wash, controls, navigation, sound, data fetching, timers, and new dependencies.
- Center a 520 pixel bar at 1920 by 1080 and cap it responsively on smaller screens.
- Animate only the fill's horizontal transform.
- Reduced motion displays a static partially filled bar.

---

### Task 1: Replace the Sprout scene with a semantic loading-bar component

**Files:**
- Create: `src/features/demo/loading-bar-transition.tsx`
- Create: `src/features/demo/__tests__/loading-bar-transition.test.tsx`
- Delete: `src/features/demo/sprout-loading-transition.tsx`
- Delete: `src/features/demo/__tests__/sprout-loading-transition.test.tsx`
- Modify: `src/app/demo/loading-screen/page.tsx`

**Interfaces:**
- Consumes: React `CSSProperties` for the duration custom property.
- Produces: `LOADING_TRANSITION_DURATION_MS: 2000` and `LoadingBarTransition(): JSX.Element`.

- [ ] **Step 1: Write the failing minimal-markup test**

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  LOADING_TRANSITION_DURATION_MS,
  LoadingBarTransition,
} from "../loading-bar-transition";

describe("LoadingBarTransition", () => {
  it("renders only an accessible two-second loading bar", () => {
    const markup = renderToStaticMarkup(<LoadingBarTransition />);

    expect(LOADING_TRANSITION_DURATION_MS).toBe(2000);
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-label="Loading"');
    expect(markup).toContain('class="loading-transition-bar"');
    expect(markup).toContain('class="loading-transition-fill"');
    expect(markup).toContain("--loading-transition-duration:2000ms");
    expect(markup).not.toContain("SIMULATING FINANCIAL LIFE");
    expect(markup).not.toContain("Sprout");
    expect(markup).not.toContain("loading-transition-value");
    expect(markup).not.toContain("loading-transition-grid");
    expect(markup).not.toContain("loading-transition-wash");
  });
});
```

- [ ] **Step 2: Run the new test and verify the missing-module failure**

Run: `pnpm vitest run src/features/demo/__tests__/loading-bar-transition.test.tsx`

Expected: FAIL because `../loading-bar-transition` does not exist.

- [ ] **Step 3: Implement the minimal loading-bar component**

```tsx
"use client";

import type { CSSProperties } from "react";

export const LOADING_TRANSITION_DURATION_MS = 2000;

type LoadingTransitionStyle = CSSProperties & {
  "--loading-transition-duration": string;
};

export function LoadingBarTransition() {
  const style: LoadingTransitionStyle = {
    "--loading-transition-duration": `${LOADING_TRANSITION_DURATION_MS}ms`,
  };

  return (
    <section
      aria-label="Loading transition"
      className="loading-transition"
      style={style}
    >
      <div
        aria-label="Loading"
        aria-valuemax={100}
        aria-valuemin={0}
        className="loading-transition-bar"
        role="progressbar"
      >
        <span aria-hidden="true" className="loading-transition-fill" />
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Update the route to render `LoadingBarTransition`**

```tsx
import type { Metadata } from "next";

import { LoadingBarTransition } from "@/features/demo/loading-bar-transition";

export const metadata: Metadata = {
  title: "Loading Bar Transition",
  description: "A recordable two-second Life Finance loading-bar transition.",
};

export default function LoadingScreenDemoPage() {
  return <LoadingBarTransition />;
}
```

- [ ] **Step 5: Delete the superseded Sprout component and test**

Delete:

```text
src/features/demo/sprout-loading-transition.tsx
src/features/demo/__tests__/sprout-loading-transition.test.tsx
```

- [ ] **Step 6: Run the component test and verify it passes**

Run: `pnpm vitest run src/features/demo/__tests__/loading-bar-transition.test.tsx`

Expected: PASS with one test.

- [ ] **Step 7: Commit the component replacement**

```bash
git add src/app/demo/loading-screen/page.tsx src/features/demo/loading-bar-transition.tsx src/features/demo/__tests__/loading-bar-transition.test.tsx src/features/demo/sprout-loading-transition.tsx src/features/demo/__tests__/sprout-loading-transition.test.tsx
git commit -m "Simplify loading transition markup"
```

### Task 2: Replace the scene animation with one board-style loading bar

**Files:**
- Modify: `src/app/styles/loading-transition.css`
- Modify: `src/features/demo/__tests__/loading-transition-styles.test.ts`

**Interfaces:**
- Consumes: `.loading-transition`, `.loading-transition-bar`, `.loading-transition-fill`, and `--loading-transition-duration` from Task 1.
- Produces: one centered 520 pixel bar and the `loading-transition-progress` keyframe.

- [ ] **Step 1: Replace the stylesheet test with the minimal contract**

```ts
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const transitionStyles = readFileSync(
  new URL("../../../app/styles/loading-transition.css", import.meta.url),
  "utf8",
);

describe("loading transition styles", () => {
  it("centers one responsive bar on the board-white viewport", () => {
    expect(transitionStyles).toMatch(
      /\.loading-transition\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*0;[\s\S]*?min-height:\s*100dvh;[\s\S]*?place-items:\s*center;[\s\S]*?background:\s*var\(--white\);/,
    );
    expect(transitionStyles).toMatch(
      /\.loading-transition-bar\s*\{[\s\S]*?width:\s*min\(520px, calc\(100vw - 3rem\)\);[\s\S]*?border:\s*3px solid var\(--ink\);[\s\S]*?background:\s*var\(--paper-deep\);[\s\S]*?box-shadow:\s*5px 6px 0 var\(--ink\);/,
    );
  });

  it("runs one exact two-second lime-fill animation with a static fallback", () => {
    expect(transitionStyles).toContain("--loading-transition-duration: 2000ms");
    expect(transitionStyles).toMatch(
      /\.loading-transition-fill\s*\{[\s\S]*?background:\s*var\(--lime\);[\s\S]*?animation:\s*loading-transition-progress var\(--loading-transition-duration\) linear infinite;/,
    );
    expect(transitionStyles.match(/@keyframes/g)).toHaveLength(1);
    expect(transitionStyles).not.toContain("loading-transition-sprout");
    expect(transitionStyles).not.toContain("loading-transition-grid");
    expect(transitionStyles).not.toContain("loading-transition-value");
    expect(transitionStyles).not.toContain("loading-transition-wash");
    expect(transitionStyles).not.toContain("var(--blue)");
    expect(transitionStyles).not.toContain("var(--coral)");
    expect(transitionStyles).not.toContain("var(--gold)");
    expect(transitionStyles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?animation:\s*none;/,
    );
  });
});
```

- [ ] **Step 2: Run the stylesheet test and verify it fails against the current scene CSS**

Run: `pnpm vitest run src/features/demo/__tests__/loading-transition-styles.test.ts`

Expected: FAIL because the current stylesheet uses `--paper`, Sprout, grid, number, and wash selectors.

- [ ] **Step 3: Replace the stylesheet with the minimal composition**

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
  background: var(--white);
  isolation: isolate;
}

.loading-transition-bar {
  width: min(520px, calc(100vw - 3rem));
  height: 26px;
  overflow: hidden;
  border: 3px solid var(--ink);
  border-radius: 999px;
  background: var(--paper-deep);
  box-shadow: 5px 6px 0 var(--ink);
}

.loading-transition-fill {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: var(--lime);
  transform: scaleX(0);
  transform-origin: left;
  animation: loading-transition-progress var(--loading-transition-duration) linear infinite;
}

@keyframes loading-transition-progress {
  0% {
    transform: scaleX(0);
  }

  90%,
  99.99% {
    transform: scaleX(1);
  }

  100% {
    transform: scaleX(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .loading-transition-fill {
    animation: none;
    transform: scaleX(0.72);
  }
}
```

- [ ] **Step 4: Run both focused tests**

Run: `pnpm vitest run src/features/demo/__tests__/loading-bar-transition.test.tsx src/features/demo/__tests__/loading-transition-styles.test.ts`

Expected: PASS with three tests.

- [ ] **Step 5: Run project verification**

Run: `pnpm lint`

Expected: PASS with no ESLint errors.

Run: `pnpm typecheck`

Expected: PASS with no TypeScript errors.

Run: `pnpm build`

Expected: PASS and include `/demo/loading-screen` in the route list.

- [ ] **Step 6: Visually verify at 1920 by 1080**

Start the development server and capture the midpoint of the loop. Confirm the screenshot contains only the white canvas and centered outlined lime loading bar.

- [ ] **Step 7: Commit the corrected visual implementation**

```bash
git add src/app/styles/loading-transition.css src/features/demo/__tests__/loading-transition-styles.test.ts
git commit -m "Reduce transition to a loading bar"
```
