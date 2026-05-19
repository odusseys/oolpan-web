import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { clearLegacyMediaLocalStorage } from "./lib/storageCleanup";
import "./styles.css";

clearLegacyMediaLocalStorage();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}
