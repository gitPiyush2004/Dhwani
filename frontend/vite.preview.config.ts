import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Build config used only to produce the single-file HTML preview.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  base: "./",
  build: {
    outDir: "dist-preview",
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: {
      input: path.resolve(__dirname, "preview.html"),
      output: {
        inlineDynamicImports: true,
        entryFileNames: "app.js",
        assetFileNames: "app.[ext]",
      },
    },
  },
});
