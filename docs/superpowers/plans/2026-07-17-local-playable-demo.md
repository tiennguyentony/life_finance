# Local Playable Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a development-only, immediately playable backend demo that uses the canonical 3D board and existing HTTP contracts without PostgreSQL or the external tax service.

**Architecture:** Compose the existing `OnboardingService` and `RunService` with an in-memory repository and deterministic offline tax calculator. A lazy gateway sends known in-memory run IDs to the demo service and all other IDs to the existing production service, so the board continues using the same session and command API.

**Tech Stack:** Next.js 16 route handlers, React 19, TypeScript 5.9, Zod 4, Vitest 4, deterministic Life Finance core engine.

## Global Constraints

- Keep `/board` and its 3D UI as the only gameplay surface.
- Demo mode works without PostgreSQL, the external tax service, AI credentials, or seeded infrastructure.
- Demo state is server-memory-only and resets when the local Next.js server restarts.
- Demo creation is unavailable when `NODE_ENV` is not `development`.
- Reuse the existing HttpOnly cookie and same-origin protections; never return the run access secret to browser JavaScript.
- Normal onboarding and production runs must never fall back to demo adapters.
- Add no runtime dependency and no alternate frontend mock state.

---

### Task 1: Deterministic demo adapters

**Files:**
- Create: `src/server/demo/offline-tax-calculator.ts`
- Create: `src/server/demo/in-memory-run-repository.ts`
- Create: `src/server/demo/__tests__/offline-tax-calculator.test.ts`
- Create: `src/server/demo/__tests__/in-memory-run-repository.test.ts`

**Interfaces:**
- Consumes: `TaxCalculator.calculate(request): Promise<TaxCalculationResult>`, `V2Repository`, `reduceGameCommandV2`, and `sha256Canonical`.
- Produces: `OfflineDemoTaxCalculator implements TaxCalculator` and `InMemoryRunRepository implements V2Repository` with `hasRun(runId: string): boolean`.

- [ ] **Step 1: Write failing offline-tax tests**

Test a representative single-person W-2 request and assert that two calls return the same validated result, total tax equals its components, and Washington state income tax is zero. Test a non-Washington request and assert that the progressive federal, state, payroll, and after-tax values remain integer cents.

```ts
const calculator = new OfflineDemoTaxCalculator();
const first = await calculator.calculate(request);
const second = await calculator.calculate(request);
expect(second).toEqual(first);
expect(first.stateIncomeTaxCents).toBe(0);
expect(first.totalTaxCents).toBe(
  first.federalIncomeTaxCents +
    first.stateIncomeTaxCents +
    first.employeePayrollTaxCents +
    first.selfEmploymentTaxCents,
);
```

- [ ] **Step 2: Run the tax test and verify red**

Run: `pnpm vitest run src/server/demo/__tests__/offline-tax-calculator.test.ts`

Expected: FAIL because `OfflineDemoTaxCalculator` does not exist.

- [ ] **Step 3: Implement the offline calculator**

Parse the request with `taxCalculationRequestSchema`, sum W-2 and other taxable income without double-counting qualified dividends, subtract pre-tax contributions and supported deductions, then calculate:

```ts
const federalIncomeTaxCents =
  percentage(Math.min(taxableIncomeCents, 1_200_000), 100_000) +
  percentage(Math.max(0, taxableIncomeCents - 1_200_000), 120_000);
const stateIncomeTaxCents = NO_INCOME_TAX_STATES.has(input.stateCode)
  ? 0
  : percentage(taxableIncomeCents, 40_000);
const employeePayrollTaxCents = percentage(w2WagesCents, 76_500);
const selfEmploymentTaxCents = percentage(
  Math.max(0, selfEmploymentIncomeCents),
  153_000,
);
```

Use `BigInt` plus `divideRoundHalfAwayFromZero` for all percentage math, validate safe-integer conversion, echo request identity fields, use the contract-required model metadata constants, and return `taxCalculationResultSchema.parse(result)`.

- [ ] **Step 4: Run the tax test and verify green**

Run: `pnpm vitest run src/server/demo/__tests__/offline-tax-calculator.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing repository tests**

Construct an onboarded software persona, create it through `createRunV2`, verify authorization and `hasRun`, apply a mapped non-month command, apply a `process_month_v2` command, and verify idempotent replay plus stored tax evidence. Assert a bad secret raises `RunRepositoryError` with `NOT_FOUND_OR_UNAUTHORIZED`.

```ts
const repository = new InMemoryRunRepository({
  runIdFactory: () => "11111111-1111-4111-8111-111111111111",
  accessSecretFactory: () => `lf_run_${"a".repeat(43)}`,
});
expect(repository.hasRun(created.runId)).toBe(true);
await expect(repository.loadAuthorizedRunV2(created.runId, "bad")).rejects.toMatchObject({
  code: "NOT_FOUND_OR_UNAUTHORIZED",
});
```

- [ ] **Step 6: Run the repository test and verify red**

Run: `pnpm vitest run src/server/demo/__tests__/in-memory-run-repository.test.ts`

Expected: FAIL because `InMemoryRunRepository` does not exist.

- [ ] **Step 7: Implement the in-memory repository**

Store each run as an immutable state, access secret, accepted-command map, and tax-evidence maps. `applyCommandV2` must authorize first, compare duplicate command payloads with `canonicalJson`, return `idempotentReplay: true` for an exact duplicate, and otherwise call `reduceGameCommandV2` and save the resulting state, monthly record, command, and tax evidence.

```ts
type StoredDemoRun = {
  accessSecret: string;
  state: GameStateV2;
  acceptedCommands: Map<string, StoredDemoCommand>;
  taxEvidenceByCommand: Map<string, MonthlyTaxEvidence>;
  taxEvidenceByContext: Map<string, MonthlyTaxEvidence>;
};
```

Return the current native-v2 state for `migrateRunStateToV2`; reject unsupported checkpoint access with a clear error because the public demo path does not expose it.

- [ ] **Step 8: Run both adapter tests and verify green**

Run: `pnpm vitest run src/server/demo/__tests__/offline-tax-calculator.test.ts src/server/demo/__tests__/in-memory-run-repository.test.ts`

Expected: both files PASS.

- [ ] **Step 9: Commit adapters**

```bash
git add src/server/demo
git commit -m "feat: add deterministic local demo adapters"
```

### Task 2: Demo composition and lazy run routing

**Files:**
- Create: `src/server/demo/runtime.ts`
- Create: `src/server/demo/__tests__/runtime.test.ts`
- Modify: `src/server/api/runtime.ts`

**Interfaces:**
- Consumes: `InMemoryRunRepository`, `OfflineDemoTaxCalculator`, `OnboardingService`, `RunService`, `onboardingDraftForPersonaV1`, and `prepareOnboardingReviewV1`.
- Produces: `LocalDemoRuntime.createRun()`, `LocalDemoRuntime.hasRun(runId)`, `createLocalDemoRuntime()`, `isLocalDemoEnabled(environment)`, `getRunGateway()`, and `getLocalDemoRuntime()`.

- [ ] **Step 1: Write failing runtime and gateway tests**

Verify `isLocalDemoEnabled({ NODE_ENV: "development" })` is true and false for production/test. Create a demo run, read it through the gateway, process one month through `submitCommand`, and assert revision/month advance. Use a spy persistent-service factory and assert it is never invoked for demo runs but is invoked for an unknown run ID.

```ts
const demo = createLocalDemoRuntime();
const created = await demo.createRun();
const gateway = demo.createRunGateway(persistentFactory);
await gateway.getRun(created.runId, created.accessSecret);
expect(persistentFactory).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run the runtime test and verify red**

Run: `pnpm vitest run src/server/demo/__tests__/runtime.test.ts`

Expected: FAIL because the runtime module does not exist.

- [ ] **Step 3: Implement local demo composition**

`LocalDemoRuntime` owns one repository, one `RunService`, and one `OnboardingService`. `createRun()` reviews and confirms `onboardingDraftForPersonaV1("software", "local-demo-seed-v1")`. `createRunGateway(persistentFactory)` returns a `CommandRunner` whose `getRun` and `submitCommand` select the demo service only when `repository.hasRun(runId)` is true; otherwise it calls the lazy persistent factory.

```ts
export function isLocalDemoEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return environment.NODE_ENV === "development";
}
```

- [ ] **Step 4: Wire the application runtime**

Keep `getRunService()` unchanged for production composition. Add a development global singleton for the demo runtime and a cached `getRunGateway()` that calls `getRunService` only for non-demo run IDs. Update session, get-run, and command route adapters in Task 3 to consume the gateway.

- [ ] **Step 5: Run runtime tests and type-check**

Run: `pnpm vitest run src/server/demo/__tests__/runtime.test.ts`

Expected: PASS.

Run: `pnpm typecheck`

Expected: exit 0.

- [ ] **Step 6: Commit runtime composition**

```bash
git add src/server/demo/runtime.ts src/server/demo/__tests__/runtime.test.ts src/server/api/runtime.ts
git commit -m "feat: route local demo runs through backend"
```

### Task 3: Development-only demo HTTP entry point

**Files:**
- Create: `src/app/api/demo/route.ts`
- Modify: `src/server/api/current-http.ts`
- Modify: `src/server/api/__tests__/current-http.test.ts`
- Modify: `src/app/api/session/route.ts`
- Modify: `src/app/api/runs/[runId]/route.ts`
- Modify: `src/app/api/runs/[runId]/commands/route.ts`

**Interfaces:**
- Consumes: `LocalDemoRuntime.createRun()`, `isLocalDemoEnabled()`, `getRunGateway()`, existing session-cookie serializers, and `projectRunView`.
- Produces: `handleCreateDemoRun(request, createRun, options)` and `POST /api/demo`.

- [ ] **Step 1: Write failing HTTP tests**

Add tests that a development same-origin request returns 201, sets `life_finance_run`, returns a valid projected run without `accessSecret`, rejects a cross-origin request with 403, and returns 404 without calling `createRun` when disabled.

```ts
const response = await handleCreateDemoRun(request, createRun, {
  enabled: true,
  secureCookies: false,
  requestIdFactory: () => "request.demo",
});
expect(response.status).toBe(201);
expect(response.headers.get("set-cookie")).toContain("HttpOnly");
expect(await response.json()).not.toHaveProperty("accessSecret");
```

- [ ] **Step 2: Run the HTTP test and verify red**

Run: `pnpm vitest run src/server/api/__tests__/current-http.test.ts`

Expected: FAIL because `handleCreateDemoRun` is not exported.

- [ ] **Step 3: Implement the handler and route**

When disabled, return the standard error envelope with status 404 and code `NOT_FOUND`. When enabled, enforce `assertSameOriginWrite`, create the demo run, serialize the existing cookie, project the state, and return 201 with `Cache-Control: no-store`. The route passes `() => getLocalDemoRuntime().createRun()` so disabled production requests do not instantiate demo state.

- [ ] **Step 4: Route all authenticated run reads and commands through the gateway**

Replace `getRunService()` with `getRunGateway()` only in `/api/session`, `/api/runs/[runId]`, and `/api/runs/[runId]/commands`. Keep `/api/runs` normal onboarding on `getOnboardingService()`.

- [ ] **Step 5: Run HTTP and auth tests**

Run: `pnpm vitest run src/server/api/__tests__/current-http.test.ts src/server/auth/__tests__/run-session.test.ts`

Expected: both files PASS.

- [ ] **Step 6: Commit HTTP entry point**

```bash
git add src/app/api/demo/route.ts src/app/api/session/route.ts src/app/api/runs/[runId]/route.ts src/app/api/runs/[runId]/commands/route.ts src/server/api/current-http.ts src/server/api/__tests__/current-http.test.ts
git commit -m "feat: expose development demo session endpoint"
```

### Task 4: Landing-page demo launcher

**Files:**
- Create: `src/features/onboarding/demo-launch-button.tsx`
- Create: `src/features/onboarding/__tests__/demo-launch-button.test.tsx`
- Modify: `src/lib/api-client/client.ts`
- Modify: `src/lib/api-client/__tests__/client.test.ts`
- Modify: `src/features/onboarding/landing.tsx`
- Modify: `src/features/onboarding/__tests__/landing.test.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `POST /api/demo` returning `RunViewResponseWire`.
- Produces: `LifeFinanceClient.createDemoRun(): Promise<RunViewResponseWire>` and `DemoLaunchButton`.

- [ ] **Step 1: Write failing client and button tests**

Assert `createDemoRun` sends credentialed `POST /api/demo` and validates the response. For the button, mock the client, click **Instant demo**, assert it disables while loading, then pushes `/board`; on error, assert an accessible alert is shown.

```ts
await client.createDemoRun();
expect(request).toEqual({
  input: "/api/demo",
  init: { method: "POST", credentials: "same-origin" },
});
```

- [ ] **Step 2: Run UI/client tests and verify red**

Run: `pnpm vitest run src/lib/api-client/__tests__/client.test.ts src/features/onboarding/__tests__/demo-launch-button.test.tsx src/features/onboarding/__tests__/landing.test.tsx`

Expected: FAIL because the client method and component do not exist.

- [ ] **Step 3: Implement the credential-free client method and launcher**

`createDemoRun()` calls the existing private request helper with `POST /api/demo` and `runViewResponseSchema`. `DemoLaunchButton` creates a `LifeFinanceClient`, reports `Starting demo…`, redirects with `router.push("/board")`, and renders `role="alert"` on failure. It never reads or stores a run secret.

- [ ] **Step 4: Render only in development**

Add `demoEnabled?: boolean` to `Landing`, render the launcher beside Start when true, and pass `process.env.NODE_ENV === "development"` from the server page. Add styles matching the landing controls without modifying board styles or components.

- [ ] **Step 5: Run UI/client tests and accessibility assertions**

Run: `pnpm vitest run src/lib/api-client/__tests__/client.test.ts src/features/onboarding/__tests__/demo-launch-button.test.tsx src/features/onboarding/__tests__/landing.test.tsx`

Expected: all files PASS.

- [ ] **Step 6: Commit the launcher**

```bash
git add src/lib/api-client src/features/onboarding src/app/page.tsx src/app/globals.css
git commit -m "feat: launch local demo from landing page"
```

### Task 5: Documentation and complete verification

**Files:**
- Modify: `README.md`
- Modify: `docs/operations/local-development.md`

**Interfaces:**
- Consumes: `pnpm dev`, `/api/demo`, `/board`.
- Produces: a copy-paste local demo workflow and an explicit separation between demo and production dependencies.

- [ ] **Step 1: Document the instant demo path**

Add this zero-infrastructure workflow before the full-backend setup:

```bash
pnpm install
pnpm dev
```

Tell the developer to open `http://localhost:3000`, select **Instant demo**, and note that state survives refreshes but resets with the dev server. Retain the PostgreSQL/tax-service steps under **Full backend setup** and state that normal onboarding never falls back to demo data.

- [ ] **Step 2: Run focused demo and API tests**

Run: `pnpm vitest run src/server/demo src/server/api/__tests__/current-http.test.ts src/lib/api-client/__tests__/client.test.ts src/features/onboarding/__tests__/demo-launch-button.test.tsx src/features/onboarding/__tests__/landing.test.tsx`

Expected: all selected tests PASS.

- [ ] **Step 3: Run static verification**

Run: `pnpm lint`

Expected: exit 0.

Run: `pnpm typecheck`

Expected: exit 0.

- [ ] **Step 4: Run the repository test gates**

Run: `pnpm test:parallel`

Expected: exit 0 with no failed test files.

Run: `pnpm test:long-run`

Expected: exit 0 with all three long-run files passing.

- [ ] **Step 5: Run a production build**

Run: `pnpm build`

Expected: exit 0; `/api/demo` may be compiled as a route but its handler returns 404 when `NODE_ENV=production`.

- [ ] **Step 6: Browser smoke test without backend dependencies**

Start `pnpm dev` with no `DATABASE_URL`, `TAX_SERVICE_URL`, or `TAX_SERVICE_TOKEN`. Open the landing page, select **Instant demo**, verify `/board` renders the canonical 3D scene, process one month, resolve any pending event, refresh, and verify the updated backend state remains.

- [ ] **Step 7: Commit documentation and final integration**

```bash
git add README.md docs/operations/local-development.md
git commit -m "docs: explain instant local demo"
```
