import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  worker: { format: "es" },
  // three.js and its React bindings are most of the bundle (about 340 kB
  // gzipped). It is downloaded once and then cached as an offline app, so the
  // default 500 kB warning is raised instead of splitting the 3D viewer.
  build: { target: "es2022", sourcemap: true, chunkSizeWarningLimit: 1500 },
});
