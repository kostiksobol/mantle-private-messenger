import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@mantle/messenger-core": fileURLToPath(
        new URL("../../packages/messenger-core/src", import.meta.url)
      ),
    },
  },
});
