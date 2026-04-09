import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig({
  plugins: [
    nodePolyfills({
      globals: {
        Buffer: true, // This fixes the Assertion failed
        global: true,
        process: true,
      },
    }),
  ],
  define: {
    'process.env': {}, 
  },
  build: {
    target: 'esnext',
  },
});
