import { useEffect, useRef } from "react";
import type { AppLanguage } from "@study/shared";
import type { PealimRootEntry, PealimRootGroup } from "../lib/rootFinder";
import { t } from "../lib/copy";

type RootFinderModalProps = {
  uiLanguage: AppLanguage;
  query: string;
  results: PealimRootGroup[];
  isLoading: boolean;
  error: string | null;
  savingEntryId: string | null;
  addedEntryIds: Set<string>;
  onQueryChange: (value: string) => void;
  onAddEntry: (entry: PealimRootEntry) => void;
  onClose: () => void;
};

function metadataLabels(entry: PealimRootEntry) {
  return [
    entry.metadata.posRaw,
    entry.metadata.transitivity,
    entry.metadata.descriptors,
    entry.metadata.number
  ].filter((label): label is string => Boolean(label));
}

export function RootFinderModal({
  uiLanguage,
  query,
  results,
  isLoading,
  error,
  savingEntryId,
  addedEntryIds,
  onQueryChange,
  onAddEntry,
  onClose
}: RootFinderModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hasQuery = query.trim().length > 0;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function renderBody() {
    if (isLoading) {
      return (
        <div className="suggestions-empty suggestions-loading root-finder-empty">
          <span className="button-spinner" aria-hidden="true" />
          <span>{t(uiLanguage, "rootFinderLoading")}</span>
        </div>
      );
    }

    if (error) {
      return <div className="suggestions-empty root-finder-empty root-finder-error">{error}</div>;
    }

    if (!hasQuery) {
      return <div className="suggestions-empty root-finder-empty">{t(uiLanguage, "rootFinderPrompt")}</div>;
    }

    if (results.length === 0) {
      return <div className="suggestions-empty root-finder-empty">{t(uiLanguage, "rootFinderNoResults")}</div>;
    }

    return (
      <div className="root-finder-results" data-testid="root-finder-results">
        {results.map((group) => (
          <section className="root-finder-group" key={group.root}>
            <div className="root-finder-group-header">
              <span>{t(uiLanguage, "rootFinderRootLabel")}</span>
              <strong dir="rtl">{group.root}</strong>
              <span>{group.entries.length}</span>
            </div>
            <div className="root-finder-entry-grid">
              {group.entries.map((entry) => {
                const isAdded = addedEntryIds.has(entry.id);
                const isSaving = savingEntryId === entry.id;

                return (
                  <article key={entry.id} className={isAdded ? "root-finder-entry root-finder-entry-added" : "root-finder-entry"}>
                    <div className="root-finder-entry-copy">
                      <p className="root-finder-hebrew" dir="rtl">{entry.hebrew}</p>
                      <p className="root-finder-translation">{entry.translation}</p>
                    </div>
                    <div className="root-finder-entry-footer">
                      <div className="root-finder-meta">
                        {metadataLabels(entry).map((label, index) => (
                          <span key={`${label}-${index}`}>{label}</span>
                        ))}
                      </div>
                      <button
                        className={isAdded ? "suggestion-add-button suggestion-add-button-added" : "suggestion-add-button"}
                        type="button"
                        disabled={isAdded || savingEntryId !== null}
                        data-root-finder-add={entry.id}
                        onClick={() => onAddEntry(entry)}
                      >
                        <span className="button-content">
                          {isSaving ? <span className="button-spinner" aria-hidden="true" /> : null}
                          {isAdded ? <span className="suggestion-added-check" aria-hidden="true">✓</span> : null}
                          <span>{isAdded ? t(uiLanguage, "suggestionAddedButton") : t(uiLanguage, "addSuggestion")}</span>
                        </span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-panel root-finder-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="root-finder-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="section-row modal-header">
          <div>
            <h2 id="root-finder-title">{t(uiLanguage, "rootFinderTitle")}</h2>
            <p className="modal-caption">{t(uiLanguage, "rootFinderCaption")}</p>
          </div>
          <button className="secondary-button modal-close-button" type="button" onClick={onClose}>
            {t(uiLanguage, "close")}
          </button>
        </div>

        <label className="root-finder-search">
          <span className="sr-only">{t(uiLanguage, "rootFinderSearchLabel")}</span>
          <input
            ref={inputRef}
            value={query}
            type="text"
            dir="rtl"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            data-testid="root-finder-input"
            placeholder={t(uiLanguage, "rootFinderPlaceholder")}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>

        {renderBody()}
      </section>
    </div>
  );
}
