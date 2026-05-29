import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { ARABIC_FORM_IDS, ARABIC_FORM_LABELS, ARABIC_LETTERS } from "./deck";
export function LetterChartModal({ isOpen, onClose }) {
    const [activeForm, setActiveForm] = useState("isolated");
    if (!isOpen) {
        return null;
    }
    return (_jsx("div", { className: "modal-backdrop", role: "presentation", onClick: onClose, children: _jsxs("section", { className: "letter-modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "letter-chart-title", onClick: (event) => event.stopPropagation(), children: [_jsxs("div", { className: "modal-header", children: [_jsxs("div", { children: [_jsx("h2", { id: "letter-chart-title", children: "Arabic letters" }), _jsxs("p", { className: "modal-subtitle", children: [ARABIC_FORM_LABELS[activeForm], " forms"] })] }), _jsx("button", { className: "icon-button", type: "button", "aria-label": "Close letter chart", onClick: onClose, children: "\u00D7" })] }), _jsx("div", { className: "form-tabs", role: "tablist", "aria-label": "Arabic letter form", children: ARABIC_FORM_IDS.map((form) => (_jsx("button", { className: form === activeForm ? "form-tab active" : "form-tab", type: "button", role: "tab", "aria-selected": form === activeForm, onClick: () => setActiveForm(form), children: ARABIC_FORM_LABELS[form] }, form))) }), _jsx("div", { className: "letter-grid", children: ARABIC_LETTERS.map((letter) => (_jsxs("div", { className: "letter-row", children: [_jsx("span", { className: "chart-arabic", dir: "rtl", children: letter.forms[activeForm] }), _jsxs("span", { className: "chart-english", children: [_jsx("strong", { children: letter.transliteration }), _jsx("span", { children: letter.name })] })] }, letter.id))) })] }) }));
}
