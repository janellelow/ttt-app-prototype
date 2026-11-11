import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative paths so the built app works from any static host or sub-folder.
  base: "./",
  server: { host: true, port: 5173 },
});
