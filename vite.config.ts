import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_DEPLOY_CONTEXT": JSON.stringify(process.env.CONTEXT ?? "development"),
    "import.meta.env.VITE_APP_RELEASE": JSON.stringify(process.env.COMMIT_REF ?? process.env.GITHUB_SHA ?? "local"),
  },
});
