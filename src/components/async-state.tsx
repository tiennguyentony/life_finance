import { Sprout } from "./sprout";

export function LoadingState({ label }: { readonly label: string }) {
  return (
    <div className="async-state" role="status">
      <Sprout emotion="thinking" size="small" />
      <div>
        <strong>{label}</strong>
        <span className="loading-line" />
        <span className="loading-line loading-line-short" />
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  action,
}: {
  readonly title: string;
  readonly action: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <Sprout emotion="idle" size="small" />
      <h2>{title}</h2>
      {action}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry: () => void;
}) {
  return (
    <div className="empty-state error-state" role="alert">
      <Sprout emotion="cry" size="small" />
      <h2>Sprout dropped the numbers.</h2>
      <p>{message}</p>
      <button className="button button-primary" onClick={onRetry} type="button">
        Try again
      </button>
    </div>
  );
}
