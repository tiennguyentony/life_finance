# Life Finance Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lean Next.js localhost shell whose folders and routes map clearly to the four approved Life Finance CUJs.

**Architecture:** Keep one deployable Next.js App Router application. Routes compose CUJ-owned feature modules; shared UI lives in `src/components`; framework-free contracts live in `src/core`; shared immutable catalogs will live in `src/data` when real data exists.

**Tech Stack:** Node.js 22, pnpm 11.4.0, Next.js 16.2.10, React 19.2.7, TypeScript 5.9.3, ESLint 10.7.0, Vitest 4.1.10, plain CSS.

## Global Constraints

- Browser-first and single-player only.
- Localhost shell only; no database, authentication, cloud persistence, or deployment platform.
- AI has no authority over calculations, event selection, validation, or state mutation.
- Do not implement tax, market, exposure, turn, burnout, inflation, or AI logic.
- Use one application; do not add monorepo tooling, a UI framework, a state library, an AI SDK, or a database client.
- Do not add tests that merely assert placeholder copy.

## File Map

```text
.github/workflows/ci.yml            GitHub verification
README.md                           Setup, scope, routes, commands
CONTRIBUTING.md                     Folder ownership rules
docs/architecture/repository.md     Durable architecture guidance
src/app/                            Routes and page composition
src/components/                     Proven shared presentation
src/core/                           Framework-free contracts and CUJ catalog
src/data/README.md                  Future static-data boundary
src/features/character/             Character CUJ placeholder module
src/features/dashboard/             Dashboard CUJ placeholder module
src/features/game-master/           Game Master CUJ placeholder module
src/features/psychology-traps/       Psychology Traps CUJ placeholder module
```

---

### Task 1: Toolchain and typed CUJ catalog

**Files:**
- Create: `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `next-env.d.ts`, `eslint.config.mjs`, `vitest.config.ts`, `.gitignore`
- Test: `src/core/cuj.test.ts`
- Create: `src/core/cuj.ts`, `src/core/game-state.ts`

**Interfaces:**
- Produces: `CUJS`, `CujDefinition`, `CujSlug`, and type-only `GameState` contracts.
- Consumers: home page, header, feature shell, and future persistence work.

- [ ] **Step 1: Add tool configuration**

Create `package.json` with these exact scripts and versions:

```json
{
  "name": "life-finance",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@11.4.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "verify": "pnpm lint && pnpm typecheck && pnpm test && pnpm build"
  },
  "dependencies": {
    "next": "16.2.10",
    "react": "19.2.7",
    "react-dom": "19.2.7"
  },
  "devDependencies": {
    "@types/node": "^22.14.0",
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.3",
    "eslint": "10.7.0",
    "eslint-config-next": "16.2.10",
    "typescript": "5.9.3",
    "vitest": "4.1.10"
  }
}
```

Configure strict TypeScript with the Next.js plugin and `@/*` mapped to `src/*`. Configure the flat ESLint presets `core-web-vitals` and `typescript`. Configure Vitest to include `src/**/*.test.ts`. Ignore dependencies, `.next`, coverage, local environment files, and OS/editor artifacts.

- [ ] **Step 2: Install dependencies**

Run: `corepack pnpm install`

Expected: exit 0 and a new `pnpm-lock.yaml`.

- [ ] **Step 3: Write the failing catalog test**

```ts
import { describe, expect, it } from "vitest";
import { CUJS } from "./cuj";

describe("CUJS", () => {
  it("defines the four journeys in player order", () => {
    expect(CUJS.map(({ number, slug }) => ({ number, slug }))).toEqual([
      { number: 1, slug: "character" },
      { number: 2, slug: "dashboard" },
      { number: 3, slug: "game-master" },
      { number: 4, slug: "psychology-traps" },
    ]);
  });

  it("gives every journey a unique local route", () => {
    const hrefs = CUJS.map(({ href }) => href);
    expect(new Set(hrefs).size).toBe(CUJS.length);
    expect(hrefs.every((href) => href.startsWith("/"))).toBe(true);
  });
});
```

- [ ] **Step 4: Confirm RED**

Run: `corepack pnpm test`

Expected: FAIL because `src/core/cuj.ts` does not exist.

- [ ] **Step 5: Implement the typed catalog**

```ts
export type CujSlug = "character" | "dashboard" | "game-master" | "psychology-traps";
export type CujDefinition = {
  readonly number: 1 | 2 | 3 | 4;
  readonly slug: CujSlug;
  readonly href: `/${CujSlug}`;
  readonly title: string;
  readonly summary: string;
};

export const CUJS = [
  { number: 1, slug: "character", href: "/character", title: "Character & Localization", summary: "Define the player's starting financial context." },
  { number: 2, slug: "dashboard", href: "/dashboard", title: "Monthly Dashboard", summary: "Review the player's financial state and future turn controls." },
  { number: 3, slug: "game-master", href: "/game-master", title: "Game Master Events", summary: "Reserve the boundary for deterministic financial stress events." },
  { number: 4, slug: "psychology-traps", href: "/psychology-traps", title: "Psychology Traps", summary: "Reserve the boundary for speculative decisions and behavioral pressure." }
] as const satisfies readonly CujDefinition[];
```

Create `game-state.ts` with type-only contracts and no calculation functions:

```ts
export type PlayerProfile = {
  readonly age: number;
  readonly locationId: string;
  readonly careerTrackId: string;
};

export type FinancialSnapshot = {
  readonly cashCents: number;
  readonly assetCents: number;
  readonly liabilityCents: number;
};

export type WellbeingSnapshot = {
  readonly burnoutPercent: number;
  readonly happinessPercent: number;
};

export type GameState = {
  readonly schemaVersion: 1;
  readonly month: number;
  readonly player: PlayerProfile;
  readonly finances: FinancialSnapshot;
  readonly wellbeing: WellbeingSnapshot;
};
```

- [ ] **Step 6: Confirm GREEN and commit**

Run: `corepack pnpm test`

Expected: 1 file and 2 tests pass.

Commit: `git commit -m "Set up the typed Life Finance foundation"`

---

### Task 2: Localhost shell and CUJ routes

**Files:**
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/not-found.tsx`, `src/app/globals.css`
- Create: `src/app/character/page.tsx`, `src/app/dashboard/page.tsx`, `src/app/game-master/page.tsx`, `src/app/psychology-traps/page.tsx`
- Create: `src/components/app-header.tsx`, `src/components/feature-shell.tsx`
- Create: `src/features/character/character-overview.tsx`, `src/features/dashboard/dashboard-overview.tsx`
- Create: `src/features/game-master/game-master-overview.tsx`, `src/features/psychology-traps/psychology-traps-overview.tsx`

**Interfaces:**
- Consumes: `CUJS` and `CujDefinition`.
- Produces: `/`, `/character`, `/dashboard`, `/game-master`, and `/psychology-traps`.

- [ ] **Step 1: Add the shared shell**

`AppHeader` maps `CUJS` into Next.js links. `FeatureShell` uses this exact public interface:

```tsx
type FeatureShellProps = {
  readonly journey: CujDefinition;
  readonly phase: string;
  readonly responsibilities: readonly string[];
};

export function FeatureShell({ journey, phase, responsibilities }: FeatureShellProps) {
  return (
    <section className="feature-shell">
      <p className="eyebrow">CUJ {journey.number}</p>
      <h1>{journey.title}</h1>
      <p className="lede">{journey.summary}</p>
      <div className="status-card"><span>Current phase</span><strong>{phase}</strong></div>
      <h2>Future ownership</h2>
      <ul>{responsibilities.map((item) => <li key={item}>{item}</li>)}</ul>
    </section>
  );
}
```

- [ ] **Step 2: Add CUJ-owned overview modules and thin routes**

Each feature selects its catalog entry and supplies only its own responsibilities. Each route only renders its feature entry point:

```tsx
import { CharacterOverview } from "@/features/character/character-overview";

export default function CharacterPage() {
  return <CharacterOverview />;
}
```

Ownership lists: character owns intake/localization/starting state; dashboard owns financial presentation/allocation/turn orchestration; Game Master owns exposure inputs/event templates/mitigation choices; psychology traps owns the hype feed/speculative instruments/trap scheduling.

- [ ] **Step 3: Add home, not-found, and responsive styles**

The home page states this is a structural shell and renders four linked cards from `CUJS`. The not-found page links home. Plain CSS provides tokens, accessible focus states, a responsive card grid, and readable feature panels; it adds no remote fonts or animation library.

```css
:root { color-scheme: dark; --background: #07110d; --surface: #102019; --text: #f3f8f5; --muted: #9bb0a5; --accent: #8bf0b4; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--background); color: var(--text); font-family: Arial, sans-serif; }
a { color: inherit; }
a:focus-visible { outline: 3px solid var(--accent); outline-offset: 4px; }
.page-shell { width: min(1120px, calc(100% - 2rem)); margin-inline: auto; }
.journey-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 1rem; }
.journey-card, .feature-shell, .status-card { border: 1px solid #294638; border-radius: 1rem; background: var(--surface); }
```

- [ ] **Step 4: Verify and commit the shell**

Run: `corepack pnpm lint`, `corepack pnpm typecheck`, and `corepack pnpm build`.

Expected: all exit 0; build lists the five static application routes.

Commit: `git commit -m "Add the Life Finance localhost shell"`

---

### Task 3: Documentation, CI, localhost proof, and publication

**Files:**
- Create: `README.md`, `CONTRIBUTING.md`, `docs/architecture/repository.md`, `src/data/README.md`, `.github/workflows/ci.yml`

- [ ] **Step 1: Document setup and ownership**

README documents Node 22, pnpm through Corepack, install/dev/verify commands, localhost URL, four routes, and non-goals. Architecture and contribution docs state: app composes routes; features own CUJ code; components contains proven shared UI; core stays framework-free and deterministic; data contains immutable catalogs, never player state. AI may narrate deterministic results but cannot author state.

- [ ] **Step 2: Add CI**

```yaml
name: CI
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 11.4.0
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm verify
```

- [ ] **Step 3: Run fresh verification and localhost probes**

Run: `corepack pnpm verify`.

Expected: lint, typecheck, 2 tests, and production build exit 0.

Start `corepack pnpm dev`, request all five routes from `http://localhost:3000`, confirm HTTP 200, then stop the server.

- [ ] **Step 4: Commit and publish privately**

Commit: `git commit -m "Document and verify the repository skeleton"`.

Confirm `gh auth status`. If no remote exists, create a private GitHub repository named `life-finance` from the current directory and push `codex/life-finance-skeleton`. Do not overwrite an existing remote.
