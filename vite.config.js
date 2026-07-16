import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  build: {
    target: "es2022",
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
    minify: "terser",

    rollupOptions: {
      input: {
                home: resolve(__dirname, "home.html"),

        landing: resolve(__dirname, "index.html"),
        spray: resolve(__dirname, "spray.html"),
        Main: resolve(__dirname, "App_index.html"),
        crypto: resolve(__dirname, "crypto41.html"),
        fiat: resolve(__dirname, "index2.html"),
        waitlist: resolve(__dirname, "waitlist.html"),

        Original: resolve(__dirname, "Original-App.html"),
        Tease: resolve(__dirname, "FD_REAL_index.html"),
        game: resolve(__dirname, "landing.html"),
        harvest: resolve(__dirname, "harvest.html"),
        brochure: resolve(__dirname, "Brochure.html"),
        privacy: resolve(__dirname, "privacy.html"),
        dashboard: resolve(__dirname, "userDash.html"),
        token: resolve(__dirname, "token.html"),
        join: resolve(__dirname, "join.html"),
        membeship: resolve(__dirname, "membership.html"),





        debug: resolve(__dirname, "debug2.html"),
        dash1: resolve(__dirname, "dashboard.html"),

        Map: resolve(__dirname, "map.html"),
        Game: resolve(__dirname, "webgame3.html"),

        rewards: resolve(__dirname, "villa_stay.html"),
        adopt: resolve(__dirname, "ADOPT_v2.html"),


        grow: resolve(__dirname, "grow.html"),
        sancarlo: resolve(__dirname, "sancarlo.html"),


        partner: resolve(__dirname, "partner.html"),

        more: resolve(__dirname, "discover.html"),

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
