import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": process.env.VITE_API_PROXY ?? "http://localhost:8000",
      "/media": process.env.VITE_API_PROXY ?? "http://localhost:8000",
    },
  },
  build: {
    rollupOptions: {
      output: {
        // libraries change less often than app code, so keep them in their own cacheable files
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          query: ["@tanstack/react-query"],
          dnd: ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities"],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    // e2e/ holds Playwright specs, run with `npm run e2e`
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
