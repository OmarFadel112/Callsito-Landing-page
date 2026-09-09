import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// IMPORTANT: set `base` to "/<your-repo-name>/" for GitHub Pages project
// sites (e.g. "/guardian-agent-demo/"). If this repo is named
// "<your-username>.github.io", leave base as "/".
export default defineConfig({
  plugins: [react()],
  base: "/guardian-agent-demo/",
});
