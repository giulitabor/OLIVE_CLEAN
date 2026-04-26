import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  build: {
    target: "es2020",
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
    minify: "terser",
    rollupOptions: {
      input: {
        landing: resolve(__dirname, "index.html"),
        crypto: resolve(__dirname, "crypto41.html"),
        fiat: resolve(__dirname, "index2.html"),
      },
      output: {
        manualChunks: {
          solana: [
            "@solana/web3.js",
            "@coral-xyz/anchor",
            "@solana/spl-token",
          ],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },

  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    cors: true,
  },

  plugins: [
    nodePolyfills({
      globals: {
        Buffer: true,
        process: true,
      },
    }),
  ],

  optimizeDeps: {
    include: ["buffer"],
    esbuildOptions: {
      define: {
        global: "globalThis",
      },
    },
  },

  define: {
    global: "globalThis",
    "process.env": {},
  },
});
