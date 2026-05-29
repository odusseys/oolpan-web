import { useState } from "react";
import { ARABIC_FORM_IDS, ARABIC_FORM_LABELS, ARABIC_LETTERS } from "./deck";
import type { ArabicLetterForm } from "./types";

type LetterChartModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function LetterChartModal({ isOpen, onClose }: LetterChartModalProps) {
  const [activeForm, setActiveForm] = useState<ArabicLetterForm>("isolated");

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="letter-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="letter-chart-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 id="letter-chart-title">Arabic letters</h2>
            <p className="modal-subtitle">{ARABIC_FORM_LABELS[activeForm]} forms</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close letter chart" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="form-tabs" role="tablist" aria-label="Arabic letter form">
          {ARABIC_FORM_IDS.map((form) => (
            <button
              className={form === activeForm ? "form-tab active" : "form-tab"}
              type="button"
              role="tab"
              aria-selected={form === activeForm}
              key={form}
              onClick={() => setActiveForm(form)}
            >
              {ARABIC_FORM_LABELS[form]}
            </button>
          ))}
        </div>

        <div className="letter-grid">
          {ARABIC_LETTERS.map((letter) => (
            <div className="letter-row" key={letter.id}>
              <span className="chart-arabic" dir="rtl">
                {letter.forms[activeForm]}
              </span>
              <span className="chart-english">
                <strong>{letter.transliteration}</strong>
                <span>{letter.name}</span>
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
