import type { EventResult } from "@/types/game";

export function EventCard({ result }: { readonly result: EventResult }) {
  return (
    <div className="event-card">
      <p className="event-eyebrow">{result.event.eyebrow}</p>
      <h2>{result.event.title}</h2>
      <p className="event-description">{result.event.description}</p>
      <div className="event-changes">
        {result.changes.map((change) => (
          <div className="event-change" key={change.label}>
            <span>{change.label}</span>
            <del>{change.before}</del>
            <strong>{change.after}</strong>
          </div>
        ))}
      </div>
      <p className="event-explanation">{result.explanation}</p>
    </div>
  );
}
