import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri očakáva pevný port pri vývoji a relatívne cesty v builde.
export default defineConfig({
  plugins: [react()],
  base: "./",
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: "es2022", outDir: "dist", chunkSizeWarningLimit: 2000 },
  test: { environment: "node" },
});
