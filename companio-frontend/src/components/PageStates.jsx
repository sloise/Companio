// Grey placeholder shapes shown while a page is loading
export function Skeleton({ rows = 3, height = 120 }) {
  return (
    <div className="stack-sm" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height }} />
      ))}
    </div>
  );
}

// Shown when a page couldn't load its data (e.g. the server or database is down)
export function LoadError({ message, onRetry }) {
  return (
    <div className="card empty" role="alert">
      <h2>Couldn&apos;t load this page</h2>
      <p className="muted">{message}</p>
      {onRetry && (
        <button type="button" className="btn btn-primary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
