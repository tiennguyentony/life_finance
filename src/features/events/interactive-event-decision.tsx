"use client";

import { useMemo, useState } from "react";

import type {
  InterpretEventResponse,
  RunViewWire,
} from "@/contracts/api/contracts";
import { LifeFinanceClient } from "@/lib/api-client/client";

import {
  commitInteractiveEventChoice,
  processInteractiveEventDecision,
} from "./interactive-event-controller";

type PendingEvent = Extract<RunViewWire["pendingInteraction"], { kind: "event" }>;

type Props = Readonly<{
  run: RunViewWire;
  onCommitted: (run: RunViewWire, reaction: string) => void;
}>;

type ConversationMessage = Readonly<{
  role: "player" | "sprout";
  content: string;
}>;

const DEFAULT_ADVICE_PROMPT =
  "What would you recommend for my current financial situation, and why?";

export function interactiveEventAdvicePrompt(statedConcern: string): string {
  const normalized = statedConcern.trim();
  return normalized.length === 0
    ? DEFAULT_ADVICE_PROMPT
    : `My priority or concern is: ${normalized.slice(0, 360)}. ${DEFAULT_ADVICE_PROMPT}`;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error && reason.message
    ? reason.message
    : "The decision could not be processed. Please try again.";
}

export function InteractiveEventDecision({ run, onCommitted }: Props) {
  const event = run.pendingInteraction as PendingEvent;
  const [playerText, setPlayerText] = useState("");
  const [conversation, setConversation] = useState<readonly ConversationMessage[]>([]);
  const [interpretation, setInterpretation] =
    useState<InterpretEventResponse | null>(null);
  const [committedRun, setCommittedRun] = useState<RunViewWire | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mappedChoice = useMemo(() => {
    const choiceId = interpretation?.choiceId ??
      interpretation?.recommendation?.choiceId ?? null;
    return choiceId === null
      ? null
      : event.choices.find(({ id }) => id === choiceId) ?? null;
  }, [event.choices, interpretation]);

  const interpret = async (
    interactionMode: "interpret" | "recommend" = "interpret",
    suppliedAnswer?: string,
  ) => {
    const answer = suppliedAnswer ?? playerText.trim();
    if (busy || answer.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const nextConversation: readonly ConversationMessage[] = [
        ...conversation,
        { role: "player", content: answer },
      ];
      const result = await processInteractiveEventDecision(
        new LifeFinanceClient(),
        run,
        nextConversation,
        `interactive.event.${crypto.randomUUID()}`,
        undefined,
        interactionMode,
      );
      if (result.interpretation.status === "question") {
        setConversation([
          ...nextConversation,
          { role: "sprout", content: result.interpretation.systemMessage },
        ]);
        setPlayerText("");
        setInterpretation(null);
      } else {
        setConversation(nextConversation);
        setInterpretation(result.interpretation);
        setCommittedRun(result.committedRun);
      }
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const retry = () => {
    setInterpretation(null);
    setConversation([]);
    setError(null);
    setPlayerText("");
  };

  const askForAdvice = () => {
    void interpret(
      "recommend",
      interactiveEventAdvicePrompt(playerText),
    );
  };

  const acceptProposedChoice = async () => {
    const choiceId = interpretation?.recommendation?.choiceId ??
      (interpretation?.status === "confirmation" ? interpretation.choiceId : null);
    if (busy || choiceId === null || choiceId === undefined) return;
    setBusy(true);
    setError(null);
    try {
      const updatedRun = await commitInteractiveEventChoice(
        new LifeFinanceClient(),
        run,
        choiceId,
        `interactive.event.confirmation.${crypto.randomUUID()}`,
      );
      setCommittedRun(updatedRun);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const continueWithoutRecommendation = () => {
    if (interpretation?.status !== "recommendation") return;
    const usedPlayerTurns = conversation.filter(({ role }) => role === "player").length;
    setConversation(usedPlayerTurns >= 3
      ? []
      : [...conversation, {
          role: "sprout",
          content: interpretation.sproutReaction,
        }]);
    setInterpretation(null);
    setPlayerText("");
    setError(null);
  };

  const correctInterpretation = () => {
    if (interpretation?.status !== "confirmation") return;
    const usedPlayerTurns = conversation.filter(({ role }) => role === "player").length;
    setConversation(usedPlayerTurns >= 3
      ? []
      : [...conversation, {
          role: "sprout",
          content: interpretation.systemMessage,
        }]);
    setInterpretation(null);
    setPlayerText("");
    setError(null);
  };

  if (committedRun && interpretation) {
    return (
      <section aria-live="polite" className="interactive-event-result">
        <p className="interactive-event-system">Decision saved.</p>
        <ConversationTranscript messages={conversation} />
        <h3>{mappedChoice?.label ?? "Financial action processed"}</h3>
        {mappedChoice?.description ? <p>{mappedChoice.description}</p> : null}
        <blockquote>
          <strong>Sprout</strong>
          <span>“{interpretation.sproutReaction}”</span>
        </blockquote>
        <aside>
          <strong>Why this matters</strong>
          <p>{interpretation.education}</p>
        </aside>
        <button
          className="interactive-event-primary"
          onClick={() => onCommitted(committedRun, interpretation.sproutReaction)}
          type="button"
        >
          Continue
        </button>
      </section>
    );
  }

  if (
    interpretation?.status === "recommendation" &&
    interpretation.recommendation !== null &&
    mappedChoice !== null
  ) {
    return (
      <section aria-live="polite" className="interactive-event-result">
        <p className="interactive-event-system">{interpretation.systemMessage}</p>
        <ConversationTranscript messages={conversation} />
        <blockquote>
          <strong>Sprout</strong>
          <span>“{interpretation.sproutReaction}”</span>
        </blockquote>
        <aside>
          <strong>Why it fits your situation</strong>
          <p>{interpretation.recommendation.reason}</p>
          <strong>Trade-off</strong>
          <p>{interpretation.recommendation.tradeoff}</p>
        </aside>
        <p className="interactive-event-hint">
          Sprout is advising, not deciding. Nothing changes until you confirm an action.
        </p>
        {error ? <p className="interactive-event-error">{error}</p> : null}
        <div className="interactive-event-actions">
          <button
            className="interactive-event-primary"
            disabled={busy}
            onClick={() => void acceptProposedChoice()}
            type="button"
          >
            {busy ? "Applying decision…" : `Choose ${mappedChoice.label}`}
          </button>
          <button
            disabled={busy}
            onClick={continueWithoutRecommendation}
            type="button"
          >
            Make my own choice
          </button>
        </div>
      </section>
    );
  }

  if (
    interpretation?.status === "confirmation" &&
    interpretation.choiceId !== null &&
    mappedChoice !== null
  ) {
    return (
      <section aria-live="polite" className="interactive-event-result">
        <p className="interactive-event-system">{interpretation.systemMessage}</p>
        <ConversationTranscript messages={conversation} />
        <blockquote>
          <strong>Sprout understood</strong>
          <span>“{interpretation.sproutReaction}”</span>
        </blockquote>
        <p className="interactive-event-hint">
          Nothing has been applied yet. Confirm the action only if Sprout understood your full conversation correctly.
        </p>
        {error ? <p className="interactive-event-error">{error}</p> : null}
        <div className="interactive-event-actions">
          <button
            className="interactive-event-primary"
            disabled={busy}
            onClick={() => void acceptProposedChoice()}
            type="button"
          >
            {busy ? "Applying decision…" : `Confirm ${mappedChoice.label}`}
          </button>
          <button disabled={busy} onClick={correctInterpretation} type="button">
            That is not what I meant
          </button>
        </div>
      </section>
    );
  }

  if (interpretation) {
    return (
      <section aria-live="polite" className="interactive-event-result">
        <p className="interactive-event-system">{interpretation.systemMessage}</p>
        <ConversationTranscript messages={conversation} />

        <blockquote>
          <strong>Sprout</strong>
          <span>“{interpretation.sproutReaction}”</span>
        </blockquote>
        <aside>
          <strong>Money lesson</strong>
          <p>{interpretation.education}</p>
        </aside>

        {error ? <p className="interactive-event-error">{error}</p> : null}
        <div className="interactive-event-actions">
          <button disabled={busy} onClick={retry} type="button">
            Try a clearer answer
          </button>
        </div>
      </section>
    );
  }

  return (
    <form
      className="interactive-event-form"
      onSubmit={(formEvent) => {
        formEvent.preventDefault();
        void interpret("interpret");
      }}
    >
      <ConversationTranscript messages={conversation} />
      <label htmlFor={`event-answer-${event.eventId}`}>
        {conversation.length === 0
          ? "How do you want to handle this event?"
          : `Your answer to Sprout — turn ${conversation.filter(({ role }) => role === "player").length + 1} of 3`}
      </label>
      <textarea
        autoComplete="off"
        disabled={busy}
        id={`event-answer-${event.eventId}`}
        maxLength={500}
        onChange={(changeEvent) => setPlayerText(changeEvent.target.value)}
        placeholder={conversation.length === 0
          ? "Type your own response in English…"
          : "Answer Sprout’s question in English…"}
        rows={3}
        value={playerText}
      />
      <fieldset className="interactive-event-directions">
        <legend>What you can decide</legend>
        <p>
          Choose a supported direction to put it into the answer box, or describe your own approach in English.
        </p>
        <div>
          {event.choices.filter(({ enabled }) => enabled).map((choice) => (
            <button
              aria-label={`Use ${choice.label} as my answer`}
              disabled={busy}
              key={choice.id}
              onClick={() => setPlayerText(choice.label)}
              type="button"
            >
              {choice.label}
            </button>
          ))}
        </div>
      </fieldset>
      <p className="interactive-event-hint">
        A clear action can finish immediately. Ask Sprout when you want advice grounded in your current finances.
      </p>
      <div className="interactive-event-help-row">
        <button
          className="interactive-event-help-button"
          disabled={busy}
          onClick={askForAdvice}
          type="button"
        >
          {busy ? "Sprout is thinking…" : "Ask Sprout what fits my finances"}
        </button>
      </div>
      {error ? <p className="interactive-event-error">{error}</p> : null}
      <button
        className="interactive-event-primary"
        disabled={busy || playerText.trim().length === 0}
        type="submit"
      >
        {busy
          ? "Sprout is processing your decision…"
          : conversation.length === 0
            ? "Make this decision"
            : "Answer Sprout"}
      </button>
    </form>
  );
}

function ConversationTranscript({
  messages,
}: Readonly<{ messages: readonly ConversationMessage[] }>) {
  if (messages.length === 0) return null;
  return (
    <ol
      aria-label="Decision conversation"
      aria-live="polite"
      className="interactive-event-transcript"
    >
      {messages.map((message, index) => (
        <li data-speaker={message.role} key={`${message.role}.${index}`}>
          <strong>
            {message.role === "player"
              ? "You"
              : index === messages.length - 1
                ? "Sprout asks"
                : "Sprout"}
          </strong>
          <span>{message.content}</span>
        </li>
      ))}
    </ol>
  );
}
