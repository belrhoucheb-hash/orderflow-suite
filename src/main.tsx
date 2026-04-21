import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./i18n";
import "./index.css";

// Bij een nieuwe deploy verwijst de reeds geladen index.html nog naar
// de oude chunk-hashes. De lazy import faalt dan met een Vite preload-
// error. Eenmalig herladen laadt de nieuwe index.html met huidige hashes.
window.addEventListener("vite:preloadError", () => {
  const RELOAD_KEY = "vite-preload-reloaded";
  if (sessionStorage.getItem(RELOAD_KEY)) return;
  sessionStorage.setItem(RELOAD_KEY, "1");
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(<App />);
