import { describe, expect, it } from "vitest";

import type { RunView } from "@/application/game/run-view";

import { buildEventRecommendationPolicy } from "../event-recommendation-policy";

function preview(input: Readonly<{
  immediateCashChangeCents?: number;
  recurringMonthlyCents?: number;
  recurringDurationMonths?: number;
  happinessPpm?: number;
}>) {
  const recurringMonthlyCents = input.recurringMonthlyCents ?? 0;
  const recurringDurationMonths = input.recurringDurationMonths ?? 0;
  return Object.freeze({
    version: "personal-event-response-preview-v1" as const,
    status: "available" as const,
    immediateCashChangeCents: input.immediateCashChangeCents ?? 0,
    recurringCashFlows: recurringMonthlyCents === 0
      ? Object.freeze([])
      : Object.freeze([Object.freeze({
          direction: "expense" as const,
          monthlyCents: recurringMonthlyCents,
          durationMonths: recurringDurationMonths,
          totalCents: recurringMonthlyCents * recurringDurationMonths,
        })]),
    annualLivingCostChangeCents: 0,
    wellbeingChangesPpm: Object.freeze({
      happiness: input.happinessPpm ?? 0,
      burnout: 0,
    }),
    followUps: Object.freeze([]),
    netOutcomeCents: null,
    unavailableReason: null,
    summary: "Engine-owned preview.",
  });
}

function socialCommitmentRun(
  cashCents = 600_000,
  monthlyRequiredCashCents = 300_000,
  preparednessBand: "exposed" | "resilient" = cashCents < 900_000
    ? "exposed"
    : "resilient",
): RunView {
  return {
    revision: 7,
    finances: {
      cashCents,
      monthlyObligations: { totalRequiredCashCents: monthlyRequiredCashCents },
    },
    preparedness: { band: preparednessBand },
    pendingInteraction: {
      kind: "event",
      eventId: "event.social-commitment",
      templateId: "personal.social_commitment",
      choiceIds: [
        "pay_commitment_now",
        "spread_commitment_cost",
        "decline_commitment",
      ],
      choices: [
        {
          id: "pay_commitment_now",
          label: "Pay for the commitment now",
          description: "Pay $433.05 now. Happiness improves.",
          enabled: true,
          preview: preview({
            immediateCashChangeCents: -43_305,
            happinessPpm: 40_000,
          }),
        },
        {
          id: "spread_commitment_cost",
          label: "Spread the cost over three months",
          description: "Pay $173.22 for three months. Happiness improves.",
          enabled: true,
          preview: preview({
            recurringMonthlyCents: 17_322,
            recurringDurationMonths: 3,
            happinessPpm: 40_000,
          }),
        },
        {
          id: "decline_commitment",
          label: "Decline the commitment",
          description: "Happiness declines.",
          enabled: true,
          preview: preview({ happinessPpm: -50_000 }),
        },
      ],
      parameters: { commitment_cost_cents: 43_305 },
      headline: "A meaningful social commitment strains the monthly plan",
      body: "Paying, financing, and declining each protect a different part of your life.",
    },
  } as unknown as RunView;
}

function event(run: RunView) {
  if (run.pendingInteraction.kind !== "event") throw new Error("event missing");
  return run.pendingInteraction;
}

describe("event recommendation policy", () => {
  it("honors the player's latest cash priority in the reported conversation", () => {
    const run = socialCommitmentRun();
    const policy = buildEventRecommendationPolicy(run, event(run), [
      { role: "player", content: "I wanto to?" },
      { role: "sprout", content: "What single action would you take first, and what financial priority are you protecting?" },
      { role: "player", content: "my cash" },
      { role: "sprout", content: "Be specific: what will you do now to handle this situation?" },
      { role: "player", content: "What would you recommend for my current financial situation, and why?" },
    ]);

    expect(policy).toMatchObject({
      choiceId: "decline_commitment",
      priority: "protect_cash",
      tradeoff: "The deterministic preview shows that happiness declines.",
    });
    expect(`${policy.rationale} ${policy.tradeoff}`).not.toMatch(
      /late fee|penalt|interest/iu,
    );
  });

  it("chooses the cheaper wellbeing-preserving path when wellbeing is explicit", () => {
    const run = socialCommitmentRun();
    const policy = buildEventRecommendationPolicy(run, event(run), [
      { role: "player", content: "I want to protect the relationship and my happiness." },
      { role: "sprout", content: "What action are you considering?" },
      { role: "player", content: "What would you recommend?" },
    ]);

    expect(policy).toMatchObject({
      choiceId: "pay_commitment_now",
      priority: "protect_wellbeing",
    });
    expect(policy.rationale).toContain("happiness improves by 4%");
  });

  it("reads a priority embedded directly in a one-turn advice request", () => {
    const run = socialCommitmentRun();
    expect(buildEventRecommendationPolicy(run, event(run), [
      { role: "player", content: "What would you recommend to protect my cash?" },
    ])).toMatchObject({
      choiceId: "decline_commitment",
      priority: "protect_cash",
    });
  });

  it("preserves a short cash concern wrapped by the UI advice prompt", () => {
    const run = socialCommitmentRun();
    expect(buildEventRecommendationPolicy(run, event(run), [{
      role: "player",
      content: "My priority or concern is: my cash. What would you recommend for my current financial situation, and why?",
    }])).toMatchObject({
      choiceId: "decline_commitment",
      priority: "protect_cash",
    });
  });

  it("uses the balanced policy when one message explicitly protects cash and happiness", () => {
    const run = socialCommitmentRun(3_000_000);
    expect(buildEventRecommendationPolicy(run, event(run), [
      { role: "player", content: "Recommend a choice that protects my cash and happiness." },
    ])).toMatchObject({
      choiceId: "pay_commitment_now",
      priority: "balanced",
    });
  });

  it("uses cash resilience when the player has not stated a priority", () => {
    const exposed = socialCommitmentRun(600_000);
    const resilient = socialCommitmentRun(3_000_000);

    expect(buildEventRecommendationPolicy(exposed, event(exposed), [
      { role: "player", content: "What would you recommend?" },
    ])).toMatchObject({ choiceId: "decline_commitment", priority: "protect_cash" });
    expect(buildEventRecommendationPolicy(resilient, event(resilient), [
      { role: "player", content: "What would you recommend?" },
    ])).toMatchObject({ choiceId: "pay_commitment_now", priority: "balanced" });
  });

  it("does not treat zero required monthly cash as a zero-month runway", () => {
    const run = socialCommitmentRun(0, 0, "resilient");
    const policy = buildEventRecommendationPolicy(run, event(run), [
      { role: "player", content: "What would you recommend?" },
    ]);

    expect(policy.priority).toBe("balanced");
    expect(policy.rationale).not.toContain("0.0-month cash runway");
  });

  it("falls back to the strongest first-month cash result when no choice preserves the reserve", () => {
    const run = socialCommitmentRun(900_000);
    if (run.pendingInteraction.kind !== "event") throw new Error("event missing");
    const allCostRun = {
      ...run,
      pendingInteraction: {
        ...run.pendingInteraction,
        choices: run.pendingInteraction.choices.map((choice) =>
          choice.id === "decline_commitment"
            ? {
                ...choice,
                preview: preview({
                  immediateCashChangeCents: -100_000,
                  happinessPpm: 900_000,
                }),
              }
            : choice
        ),
      },
    } as unknown as RunView;

    expect(buildEventRecommendationPolicy(allCostRun, event(allCostRun), [
      { role: "player", content: "What would you recommend?" },
    ])).toMatchObject({
      choiceId: "spread_commitment_cost",
      priority: "balanced",
    });
  });

  it("uses the full modeled recurring horizon for a total-cost priority", () => {
    const run = socialCommitmentRun(3_000_000);
    if (run.pendingInteraction.kind !== "event") throw new Error("event missing");
    const longPlanRun = {
      ...run,
      pendingInteraction: {
        ...run.pendingInteraction,
        choiceIds: ["pay_once", "long_plan"],
        choices: [
          {
            id: "pay_once",
            label: "Pay once",
            description: "Pay $1,300.00 now.",
            enabled: true,
            preview: preview({ immediateCashChangeCents: -130_000 }),
          },
          {
            id: "long_plan",
            label: "Use a long payment plan",
            description: "Pay $100.00 for 24 months.",
            enabled: true,
            preview: preview({
              recurringMonthlyCents: 10_000,
              recurringDurationMonths: 24,
            }),
          },
        ],
      },
    } as unknown as RunView;

    expect(buildEventRecommendationPolicy(longPlanRun, event(longPlanRun), [
      { role: "player", content: "Recommend the lowest total cost." },
    ])).toMatchObject({
      choiceId: "pay_once",
      priority: "minimize_total_cost",
    });
  });
});
