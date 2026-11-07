/** Inline error with a Retry button. */
export function ErrorRetry({
  message = "Can't load the data.",
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  return (
    <div className="panel panel-error" role="alert">
      <span>{message}</span>
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
