import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function ProgressPanel({ summary, storageError, onOpenChart }) {
    return (_jsxs("aside", { className: "progress-panel", "aria-label": "Study progress", children: [_jsx("button", { className: "secondary-action", type: "button", onClick: onOpenChart, children: "Letter chart" }), _jsxs("div", { className: "progress-grid", children: [_jsx(ProgressMetric, { label: "Pairs", value: summary.pairCount }), _jsx(ProgressMetric, { label: "Directions", value: summary.directionCount }), _jsx(ProgressMetric, { label: "Reviewed", value: summary.reviewedDirections }), _jsx(ProgressMetric, { label: "Reviews", value: summary.totalReviews }), _jsx(ProgressMetric, { label: "Weak", value: summary.weakDirections }), _jsx(ProgressMetric, { label: "Mastered", value: summary.masteredDirections })] }), storageError ? _jsx("p", { className: "storage-error", children: storageError }) : null] }));
}
function ProgressMetric({ label, value }) {
    return (_jsxs("div", { className: "progress-metric", children: [_jsx("span", { children: label }), _jsx("strong", { children: value })] }));
}
