import { defineConfig } from "vitest/config";

// Osobny config (nie mergeConfig z vite.config.ts) — świadomie prosto,
// żeby infrastruktura testowa nie zależała od pluginów Vite, które nie
// mają tu jeszcze zastosowania (brak JSX w testowanych modułach na razie).
export default defineConfig({
  test: {
    environment: "node",
    // Ten ticket dostarcza wyłącznie infrastrukturę uruchamiania testów,
    // bez właściwych testów jednostkowych — te przychodzą z kolejnymi
    // ticketami (np. src/lib/slots.ts, patrz PRD §5).
    passWithNoTests: true,
    exclude: ["node_modules", "dist", "tests/e2e/**"],
  },
});
