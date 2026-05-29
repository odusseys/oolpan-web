type ProgressPanelProps = {
  summary: {
    pairCount: number;
    directionCount: number;
    reviewedDirections: number;
    totalReviews: number;
    weakDirections: number;
    masteredDirections: number;
  };
  storageError: string | null;
  onOpenChart: () => void;
};

export function ProgressPanel({ summary, storageError, onOpenChart }: ProgressPanelProps) {
  return (
    <aside className="progress-panel" aria-label="Study progress">
      <button className="secondary-action" type="button" onClick={onOpenChart}>
        Letter chart
      </button>

      <div className="progress-grid">
        <ProgressMetric label="Pairs" value={summary.pairCount} />
        <ProgressMetric label="Directions" value={summary.directionCount} />
        <ProgressMetric label="Reviewed" value={summary.reviewedDirections} />
        <ProgressMetric label="Reviews" value={summary.totalReviews} />
        <ProgressMetric label="Weak" value={summary.weakDirections} />
        <ProgressMetric label="Mastered" value={summary.masteredDirections} />
      </div>

      {storageError ? <p className="storage-error">{storageError}</p> : null}
    </aside>
  );
}

function ProgressMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="progress-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
