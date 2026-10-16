import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
export default defineConfig(({ mode }) => {
  // Empty prefix loads server-only settings here. Never expose via define or VITE_*.
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      proxy: {
        "/api": {
          target: "http://127.0.0.1:8000",
          headers: {
            Authorization: `Bearer ${env.ANALYSIS_SERVICE_TOKEN || process.env.ANALYSIS_SERVICE_TOKEN || ""}`,
          },
        },
      },
    },
  };
});
