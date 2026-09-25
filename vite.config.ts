import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Host usado pelo Tauri para desenvolvimento em dispositivos remotos (não usado no desktop).
const tauriDevHost = process.env.TAURI_DEV_HOST;
const isTauriDebug = Boolean(process.env.TAURI_ENV_DEBUG);

// https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  // O Tauri precisa de porta fixa e não deve ter a saída do terminal limpa.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: tauriDevHost ?? false,
    hmr: tauriDevHost ? { protocol: "ws", host: tauriDevHost, port: 1421 } : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],

  build: {
    // O WebView2 (Windows) é baseado em Chromium.
    target: "chrome105",
    minify: !isTauriDebug,
    sourcemap: isTauriDebug,
  },

  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    restoreMocks: true,
    testTimeout: 15_000,
    // Hooks podem pré-carregar chunks pesados (ver src/test/render.tsx).
    hookTimeout: 60_000,
  },
});
