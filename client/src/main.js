import { jsx as _jsx } from "react/jsx-runtime";
import React from "react";
import ReactDOM from "react-dom/client";
import { AppSwitcher } from "./AppSwitcher";
import { clearLegacyMediaLocalStorage } from "./lib/storageCleanup";
import "./styles.css";
import "./arabicTrainer/styles.css";
import "./arabicTrainer/modal.css";
import "./arabicTrainer/responsive.css";
clearLegacyMediaLocalStorage();
ReactDOM.createRoot(document.getElementById("root")).render(_jsx(React.StrictMode, { children: _jsx(AppSwitcher, {}) }));
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        void navigator.serviceWorker.register("/sw.js");
    });
}
