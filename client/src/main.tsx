import React from "react";
import ReactDOM from "react-dom/client";
import { AppSwitcher } from "./AppSwitcher";
import { clearLegacyMediaLocalStorage } from "./lib/storageCleanup";
import "./styles.css";
import "./arabicTrainer/styles.css";
import "./arabicTrainer/modal.css";
import "./arabicTrainer/responsive.css";

clearLegacyMediaLocalStorage();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppSwitcher />
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
