import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Dočasná zástupná obrazovka – skutočné UI pribudne v kroku 3 (src/App.tsx, src/ui/*).
function Placeholder() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 32 }}>
      <h1>Daňová kalkulačka</h1>
      <p>Kostra appky beží. Používateľské rozhranie sa pripravuje.</p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Placeholder />
  </StrictMode>,
);
