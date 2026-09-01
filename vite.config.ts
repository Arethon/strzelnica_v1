import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Port zamiast domyślnego 5173, żeby nie kolidować z innymi projektami
    // Vite uruchomionymi lokalnie na tej samej maszynie.
    port: 5183,
    strictPort: true,
  },
});
