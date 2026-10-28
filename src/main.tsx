import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import SimpleApp from "./SimpleApp";
import "./simple.css";
import { captureAppException, startAnalytics } from "./lib/analytics";
import { reactErrorHandlers } from "./lib/error-tracking";

void startAnalytics();

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.error("Nie udało się uruchomić trybu offline aplikacji.", error);
    });
  });
}

createRoot(document.getElementById("root")!, reactErrorHandlers(captureAppException)).render(
  <StrictMode>
    <SimpleApp />
  </StrictMode>,
);
