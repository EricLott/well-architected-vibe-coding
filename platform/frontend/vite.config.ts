import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiTarget = process.env.API_HOST ? `http://${process.env.API_HOST}:3000` : "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // Listen on all interfaces, required for Docker
    proxy: {
      "/retrieve": apiTarget,
      "/health": apiTarget,
      "/ingest": apiTarget,
      "/projects": apiTarget,
      "/assistant": apiTarget,
    },
  },
});
