import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef } from "react";
import { t } from "../lib/copy";
function metadataLabels(entry) {
    return [
        entry.metadata.posRaw,
        entry.metadata.transitivity,
        entry.metadata.descriptors,
        entry.metadata.number
    ].filter((label) => Boolean(label));
}
export function RootFinderModal({ uiLanguage, query, results, isLoading, error, savingEntryId, addedEntryIds, onQueryChange, onAddEntry, onClose }) {
    const inputRef = useRef(null);
    const hasQuery = query.trim().length > 0;
    useEffect(() => {
        inputRef.current?.focus();
    }, []);
    function renderBody() {
        if (isLoading) {
            return (_jsxs("div", { className: "suggestions-empty suggestions-loading root-finder-empty", children: [_jsx("span", { className: "button-spinner", "aria-hidden": "true" }), _jsx("span", { children: t(uiLanguage, "rootFinderLoading") })] }));
        }
        if (error) {
            return _jsx("div", { className: "suggestions-empty root-finder-empty root-finder-error", children: error });
        }
        if (!hasQuery) {
            return _jsx("div", { className: "suggestions-empty root-finder-empty", children: t(uiLanguage, "rootFinderPrompt") });
        }
        if (results.length === 0) {
            return _jsx("div", { className: "suggestions-empty root-finder-empty", children: t(uiLanguage, "rootFinderNoResults") });
        }
        return (_jsx("div", { className: "root-finder-results", "data-testid": "root-finder-results", children: results.map((group) => (_jsxs("section", { className: "root-finder-group", children: [_jsxs("div", { className: "root-finder-group-header", children: [_jsx("span", { children: t(uiLanguage, "rootFinderRootLabel") }), _jsx("strong", { dir: "rtl", children: group.root }), _jsx("span", { children: group.entries.length })] }), _jsx("div", { className: "root-finder-entry-grid", children: group.entries.map((entry) => {
                            const isAdded = addedEntryIds.has(entry.id);
                            const isSaving = savingEntryId === entry.id;
                            return (_jsxs("article", { className: isAdded ? "root-finder-entry root-finder-entry-added" : "root-finder-entry", children: [_jsxs("div", { className: "root-finder-entry-copy", children: [_jsx("p", { className: "root-finder-hebrew", dir: "rtl", children: entry.hebrew }), _jsx("p", { className: "root-finder-translation", children: entry.translation })] }), _jsxs("div", { className: "root-finder-entry-footer", children: [_jsx("div", { className: "root-finder-meta", children: metadataLabels(entry).map((label, index) => (_jsx("span", { children: label }, `${label}-${index}`))) }), _jsx("button", { className: isAdded ? "suggestion-add-button suggestion-add-button-added" : "suggestion-add-button", type: "button", disabled: isAdded || savingEntryId !== null, "data-root-finder-add": entry.id, onClick: () => onAddEntry(entry), children: _jsxs("span", { className: "button-content", children: [isSaving ? _jsx("span", { className: "button-spinner", "aria-hidden": "true" }) : null, isAdded ? _jsx("span", { className: "suggestion-added-check", "aria-hidden": "true", children: "\u2713" }) : null, _jsx("span", { children: isAdded ? t(uiLanguage, "suggestionAddedButton") : t(uiLanguage, "addSuggestion") })] }) })] })] }, entry.id));
                        }) })] }, group.root))) }));
    }
    return (_jsx("div", { className: "modal-backdrop", role: "presentation", onClick: onClose, children: _jsxs("section", { className: "modal-panel root-finder-modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "root-finder-title", onClick: (event) => event.stopPropagation(), children: [_jsxs("div", { className: "section-row modal-header", children: [_jsxs("div", { children: [_jsx("h2", { id: "root-finder-title", children: t(uiLanguage, "rootFinderTitle") }), _jsx("p", { className: "modal-caption", children: t(uiLanguage, "rootFinderCaption") })] }), _jsx("button", { className: "secondary-button modal-close-button", type: "button", onClick: onClose, children: t(uiLanguage, "close") })] }), _jsxs("label", { className: "root-finder-search", children: [_jsx("span", { className: "sr-only", children: t(uiLanguage, "rootFinderSearchLabel") }), _jsx("input", { ref: inputRef, value: query, type: "text", dir: "rtl", inputMode: "text", autoComplete: "off", spellCheck: false, "data-testid": "root-finder-input", placeholder: t(uiLanguage, "rootFinderPlaceholder"), onChange: (event) => onQueryChange(event.target.value) })] }), renderBody()] }) }));
}
