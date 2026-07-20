"use client";

import { useMemo, useState } from "react";

import type {
  InterpretEventResponse,
  RunViewWire,
} from "@/contracts/api/contracts";
import { LifeFinanceClient } from "@/lib/api-client/client";

import { processInteractiveEventDecision } from "./interactive-event-controller";

type PendingEvent = Extract<RunViewWire["pendingInteraction"], { kind: "event" }>;
type PendingEventChoice = PendingEvent["choices"][number];

type Props = Readonly<{
  run: RunViewWire;
  onCommitted: (run: RunViewWire, reaction: string) => void;
}>;

type ConversationMessage = Readonly<{
  role: "player" | "sprout";
  content: string;
}>;

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
  const [showHint, setShowHint] = useState(false);

  const mappedChoice = useMemo(() => {
    if (interpretation?.status !== "mapped" || interpretation.choiceId === null) {
      return null;
    }
    return event.choices.find(({ id }) => id === interpretation.choiceId) ?? null;
  }, [event.choices, interpretation]);

  const interpret = async (selectedChoice?: PendingEventChoice) => {
    const answer = selectedChoice?.label ?? playerText.trim();
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
        selectedChoice?.id,
      );
      if (result.interpretation.status === "question") {
        setConversation([
          ...nextConversation,
          { role: "sprout", content: result.interpretation.systemMessage },
        ]);
        setPlayerText("");
        setInterpretation(null);
        setShowHint(false);
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
    setShowHint(false);
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
        void interpret();
      }}
    >
      <ConversationTranscript messages={conversation} />
      <label htmlFor={`event-answer-${event.eventId}`}>
        {conversation.length === 0
          ? "What do you do?"
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
      <p className="interactive-event-hint">
        A clear action can finish immediately. Sprout asks another question only when your intent is genuinely unclear.
      </p>
      <div className="interactive-event-help-row">
        <button
          aria-controls={`event-hint-${event.eventId}`}
          aria-expanded={showHint}
          className="interactive-event-help-button"
          disabled={busy}
          onClick={() => setShowHint((visible) => !visible)}
          type="button"
        >
          {showHint ? "Hide hint" : "Need a hint?"}
        </button>
      </div>
      {showHint ? (
        <aside
          className="interactive-event-writing-hint"
          id={`event-hint-${event.eventId}`}
        >
          <strong>Choose a direction</strong>
          <p>
            Pick one of the available actions below, or use them as examples for your own answer.
          </p>
          <div className="interactive-event-suggestions">
            {event.choices.filter(({ enabled }) => enabled).map((choice) => (
              <button
                disabled={busy}
                key={choice.id}
                onClick={() => void interpret(choice)}
                type="button"
              >
                <strong>{choice.label}</strong>
                {choice.description ? <span>{choice.description}</span> : null}
              </button>
            ))}
          </div>
          <small>
            Selecting a suggestion applies it immediately. It does not call AI; exact financial effects appear after the decision is saved.
          </small>
        </aside>
      ) : null}
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
