/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  server: { port: 5180, strictPort: true },
  preview: { port: 5180, strictPort: true },
  plugins: [react()],
  build: {
    // The call screen's LiveKit chunk (~170 kB gzipped) is lazy-loaded on
    // /s/:id/call only; nothing else pays for it.
    chunkSizeWarningLimit: 700,
  },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
