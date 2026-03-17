import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/retrieve": "http://localhost:3000",
      "/health": "http://localhost:3000",
      "/ingest": "http://localhost:3000",
      "/projects": "http://localhost:3000",
      "/assistant": "http://localhost:3000",
    },
  },
});
