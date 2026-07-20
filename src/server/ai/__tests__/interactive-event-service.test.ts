import { describe, expect, it } from "vitest";

import type { RunView } from "@/application/game/run-view";

import { InteractiveEventService } from "../interactive-event-service";

const emptyPreview = Object.freeze({
  version: "personal-event-response-preview-v1" as const,
  status: "available" as const,
  immediateCashChangeCents: 0,
  recurringCashFlows: Object.freeze([]),
  annualLivingCostChangeCents: 0,
  wellbeingChangesPpm: Object.freeze({ happiness: 0, burnout: 0 }),
  followUps: Object.freeze([]),
  netOutcomeCents: null,
  unavailableReason: null,
  summary: "The deterministic preview is available.",
});

function runWithEvent(
  templateId = "personal.industry_layoff",
): RunView {
  return {
    runId: "run.interactive-test",
    revision: 7,
    currentMonth: "2026-09",
    pendingInteraction: {
      kind: "event",
      eventId: "event.interactive-test",
      templateId,
      choiceIds: ["maintain_lifestyle", "emergency_budget"],
      choices: [
        {
          id: "maintain_lifestyle",
          label: "Maintain current spending",
          description: "Keeping every commitment makes the full income gap payable.",
          enabled: true,
          preview: emptyPreview,
        },
        {
          id: "emergency_budget",
          label: "Activate an emergency budget",
          description: "Fast spending cuts preserve runway while income recovers.",
          enabled: true,
          preview: {
            ...emptyPreview,
            immediateCashChangeCents: -325_00,
            summary: "Pay $325.00 now.",
          },
        },
      ],
      parameters: { income_gap_cents: 50_000 },
      headline: "You were laid off",
      body: "Your income has stopped. What do you do?",
    },
  } as unknown as RunView;
}

function runWithChoices(
  choices: readonly Readonly<{ id: string; label: string }>[],
): RunView {
  const run = runWithEvent();
  if (run.pendingInteraction.kind !== "event") throw new Error("test event missing");
  return {
    ...run,
    pendingInteraction: {
      ...run.pendingInteraction,
      choiceIds: choices.map(({ id }) => id),
      choices: choices.map(({ id, label }) => ({
        id,
        label,
        description: `${label} through the deterministic engine.`,
        enabled: true,
        preview: emptyPreview,
      })),
    },
  } as unknown as RunView;
}

const request = Object.freeze({
  eventId: "event.interactive-test",
  expectedRevision: 7,
  conversation: [{ role: "player" as const, content: "A concrete plan." }],
});

function playerMessage(content: string) {
  return [{ role: "player" as const, content }];
}

describe("InteractiveEventService", () => {
  it("rejects illegal ideas without calling a model or selecting an engine action", async () => {
    const service = new InteractiveEventService(null);
    const result = await service.interpret(runWithEvent(), {
      ...request,
      conversation: playerMessage("Rob the bank?"),
    });

    expect(result).toMatchObject({
      status: "rejected",
      source: "deterministic_fast_path",
      choiceId: null,
      confidencePpm: 1_000_000,
    });
    expect(result.sproutReaction).toContain("emergency fund");
  });

  it("maps a clear practical answer through the millisecond fast path", async () => {
    const service = new InteractiveEventService(null);
    const result = await service.interpret(runWithEvent(), {
      ...request,
      conversation: playerMessage("I will cut spending and activate an emergency budget."),
    });

    expect(result).toMatchObject({
      status: "mapped",
      source: "deterministic_fast_path",
      choiceId: "emergency_budget",
    });
    expect(result.education).toContain("preserve runway");
  });

  it("maps an enabled hint choice directly without calling a model", async () => {
    let called = false;
    const service = new InteractiveEventService({
      generate: async () => {
        called = true;
        throw new Error("the hint path must not call AI");
      },
    });
    const result = await service.interpret(runWithEvent(), {
      ...request,
      selectedChoiceId: "emergency_budget",
      conversation: playerMessage("Activate an emergency budget"),
    });

    expect(result).toMatchObject({
      status: "mapped",
      source: "deterministic_fast_path",
      choiceId: "emergency_budget",
      confidencePpm: 1_000_000,
    });
    expect(called).toBe(false);
  });

  it("rejects a hint choice that is not available on the pending event", async () => {
    const service = new InteractiveEventService(null);
    const result = await service.interpret(runWithEvent(), {
      ...request,
      selectedChoiceId: "invented_choice",
      conversation: playerMessage("Invented choice"),
    });

    expect(result).toMatchObject({
      status: "rejected",
      source: "deterministic_fallback",
      choiceId: null,
    });
  });

  it.each([
    {
      choices: [
        { id: "save_bonus", label: "Keep the full bonus as cash" },
        { id: "spend_most_bonus", label: "Spend most and keep 25%" },
      ],
      answer: "I will save all of the bonus for emergencies.",
      expected: "save_bonus",
    },
    {
      choices: [
        { id: "use_insurance", label: "Use health coverage" },
        { id: "negotiate_bill", label: "Negotiate the bill" },
        { id: "medical_payment_plan", label: "Use a four-month payment plan" },
      ],
      answer: "I will call the provider and ask for a lower medical bill.",
      expected: "negotiate_bill",
    },
    {
      choices: [
        { id: "accept_increase", label: "Renew at the higher rent" },
        { id: "move_to_cheaper_home", label: "Move to a cheaper home" },
        { id: "share_housing", label: "Share housing to lower costs" },
      ],
      answer: "I will find a roommate and split the rent.",
      expected: "share_housing",
    },
    {
      choices: [
        { id: "return_duplicate", label: "Return the duplicate" },
        { id: "keep_duplicate", label: "Keep it" },
        { id: "share_duplicate", label: "Share the surplus" },
      ],
      answer: "I will send the duplicate groceries back for a refund.",
      expected: "return_duplicate",
    },
    {
      choices: [
        { id: "keep_current_lifestyle", label: "Keep current spending" },
        { id: "trial_upgrade", label: "Try the upgrade for three months" },
        { id: "accept_upgrade", label: "Upgrade the lifestyle" },
      ],
      answer: "I want to try the upgrade for a few months before committing.",
      expected: "trial_upgrade",
    },
  ])("ends on turn one for a clear natural answer: $expected", async ({
    choices,
    answer,
    expected,
  }) => {
    const service = new InteractiveEventService(null);
    const result = await service.interpret(runWithChoices(choices), {
      ...request,
      conversation: playerMessage(answer),
    });

    expect(result).toMatchObject({
      status: "mapped",
      source: "deterministic_fast_path",
      choiceId: expected,
      playerTurn: 1,
    });
  });

  it("uses the model only when deterministic wording cannot map the answer", async () => {
    const service = new InteractiveEventService({
      generate: async () => ({
        status: "mapped",
        choiceId: "emergency_budget",
        confidencePpm: 930_000,
        reasonCode: "choice_match",
        followUpQuestion: null,
      }),
      responseSource: () => "hosted_oss",
    });
    const result = await service.interpret(runWithEvent(), {
      ...request,
      conversation: playerMessage("I will make my burn rate considerably leaner."),
    });

    expect(result).toMatchObject({
      status: "mapped",
      source: "hosted_oss",
      choiceId: "emergency_budget",
      confidencePpm: 930_000,
    });
  });

  it("asks instead of auto-committing a medium-confidence local inference", async () => {
    const service = new InteractiveEventService({
      generate: async () => ({
        status: "mapped",
        choiceId: "emergency_budget",
        confidencePpm: 800_000,
        reasonCode: "choice_match",
        followUpQuestion: null,
      }),
      responseSource: () => "local_oss",
    });
    const result = await service.interpret(runWithEvent(), {
      ...request,
      conversation: playerMessage("I want to preserve long-term flexibility."),
    });

    expect(result).toMatchObject({
      status: "question",
      source: "local_oss",
      choiceId: null,
      confidencePpm: 800_000,
    });
  });

  it("asks a deterministic follow-up when the model is unavailable before turn three", async () => {
    const service = new InteractiveEventService({
      generate: async () => {
        throw new Error("provider unavailable");
      },
    });
    const result = await service.interpret(runWithEvent(), {
      ...request,
      conversation: playerMessage("I have a mysterious plan."),
    });

    expect(result).toMatchObject({
      status: "question",
      source: "deterministic_fallback",
      choiceId: null,
      playerTurn: 1,
      remainingPlayerTurns: 2,
    });
  });

  it("rejects unsupported text after the third player turn", async () => {
    const service = new InteractiveEventService({
      generate: async () => ({
        status: "mapped",
        choiceId: "maintain_lifestyle",
        confidencePpm: 80_000,
        reasonCode: "choice_match",
        followUpQuestion: null,
      }),
    });
    const result = await service.interpret(runWithEvent(), {
      ...request,
      conversation: [
        { role: "player", content: "I have an unusual idea." },
        { role: "sprout", content: "What concrete action would you take?" },
        { role: "player", content: "It is still hard to explain." },
        { role: "sprout", content: "What expense or priority would it change?" },
        { role: "player", content: "I do not know." },
      ],
    });

    expect(result).toMatchObject({
      status: "rejected",
      choiceId: null,
      playerTurn: 3,
      remainingPlayerTurns: 0,
    });
  });

  it("continues an ambiguous conversation, then maps the combined intent", async () => {
    let requestCount = 0;
    const service = new InteractiveEventService({
      generate: async () => {
        requestCount += 1;
        if (requestCount === 1) {
          return {
            status: "ambiguous",
            choiceId: null,
            confidencePpm: 420_000,
            reasonCode: "multiple_choices",
            followUpQuestion: "What single action would best protect your finances?",
          };
        }
        return {
          status: "mapped",
          choiceId: "emergency_budget",
          confidencePpm: 910_000,
          reasonCode: "choice_match",
          followUpQuestion: null,
        };
      },
      responseSource: () => "hosted_oss",
    });

    const first = await service.interpret(runWithEvent(), {
      ...request,
      conversation: playerMessage("I want to protect myself."),
    });
    expect(first).toMatchObject({
      status: "question",
      source: "hosted_oss",
      playerTurn: 1,
      remainingPlayerTurns: 2,
      systemMessage: "What single action would best protect your finances?",
    });

    const second = await service.interpret(runWithEvent(), {
      ...request,
      conversation: [
        { role: "player", content: "I want to protect myself." },
        { role: "sprout", content: first.systemMessage },
        { role: "player", content: "I will make my monthly burn rate leaner." },
      ],
    });
    expect(second).toMatchObject({
      status: "mapped",
      choiceId: "emergency_budget",
      playerTurn: 2,
      remainingPlayerTurns: 1,
    });
  });

  it("replaces an AI-generated option menu with a neutral follow-up", async () => {
    const service = new InteractiveEventService({
      generate: async () => ({
        status: "ambiguous",
        choiceId: null,
        confidencePpm: 450_000,
        reasonCode: "multiple_choices",
        followUpQuestion: "Would you keep spending or activate the emergency budget?",
      }),
    });

    const result = await service.interpret(runWithEvent(), {
      ...request,
      conversation: playerMessage("I want to be careful."),
    });

    expect(result).toMatchObject({
      status: "question",
      systemMessage: "What single action would you take first, and what financial priority are you protecting?",
    });
    expect(result.systemMessage).not.toContain("emergency budget");
  });

  it("replaces a yes-or-no hint toward one hidden choice", async () => {
    const service = new InteractiveEventService({
      generate: async () => ({
        status: "ambiguous",
        choiceId: null,
        confidencePpm: 450_000,
        reasonCode: "multiple_choices",
        followUpQuestion: "Are you considering maintaining your current spending?",
      }),
    });

    const result = await service.interpret(runWithEvent(), {
      ...request,
      conversation: playerMessage("I want to be sensible."),
    });

    expect(result).toMatchObject({
      status: "question",
      systemMessage: "What single action would you take first, and what financial priority are you protecting?",
    });
    expect(result.systemMessage).not.toContain("current spending");
  });

  it("uses a different concrete question on the second ambiguous turn", async () => {
    const service = new InteractiveEventService(null);
    const result = await service.interpret(runWithEvent(), {
      ...request,
      conversation: [
        { role: "player", content: "I want to be thoughtful." },
        { role: "sprout", content: "What single action would you take first?" },
        { role: "player", content: "I still need to think." },
      ],
    });

    expect(result).toMatchObject({
      status: "question",
      playerTurn: 2,
      remainingPlayerTurns: 1,
      systemMessage: "Be specific: what will you do now to handle this situation?",
    });
  });

  it("infers event-specific full payment from 'pay everything' on turn one", async () => {
    const choices = [
      { id: "hire_cleanup", label: "Hire cleanup" },
      { id: "build_trash_armor", label: "Build do-it-yourself trash armor" },
      { id: "ignore_inspector", label: "Ignore the tiny inspector" },
    ];
    const service = new InteractiveEventService(null);
    const result = await service.interpret(runWithChoices(choices), {
      ...request,
      conversation: playerMessage("Support pay everything"),
    });

    expect(result).toMatchObject({
      status: "mapped",
      source: "deterministic_fast_path",
      choiceId: "hire_cleanup",
      playerTurn: 1,
    });
  });

  it("asks for the missing payment object, then ends when the answer becomes clear", async () => {
    const choices = [
      { id: "hire_cleanup", label: "Hire cleanup" },
      { id: "build_trash_armor", label: "Build do-it-yourself trash armor" },
      { id: "ignore_inspector", label: "Ignore the tiny inspector" },
    ];
    const service = new InteractiveEventService(null);
    const first = await service.interpret(runWithChoices(choices), {
      ...request,
      conversation: playerMessage("I can pay"),
    });

    expect(first).toMatchObject({
      status: "question",
      playerTurn: 1,
      systemMessage: "What exactly would you pay for, and what outcome are you trying to secure?",
    });

    const second = await service.interpret(runWithChoices(choices), {
      ...request,
      conversation: [
        { role: "player", content: "I can pay" },
        { role: "sprout", content: first.systemMessage },
        { role: "player", content: "I will pay a cleanup service to fix the bins." },
      ],
    });

    expect(second).toMatchObject({
      status: "mapped",
      source: "deterministic_fast_path",
      choiceId: "hire_cleanup",
      playerTurn: 2,
    });
  });

  it("rejects malformed role order before calling the model", async () => {
    let called = false;
    const service = new InteractiveEventService({
      generate: async () => {
        called = true;
        throw new Error("should not run");
      },
    });

    await expect(service.interpret(runWithEvent(), {
      ...request,
      conversation: [
        { role: "player", content: "First thought." },
        { role: "player", content: "Second thought." },
      ],
    })).rejects.toMatchObject({ code: "EVENT_MISMATCH" });
    expect(called).toBe(false);
  });
});
