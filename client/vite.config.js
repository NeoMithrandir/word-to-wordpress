import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  server: {
    // Honor PORT from `client:dev` (cross-env PORT=3006). Vite 7 does not
    // read PORT on its own; the old hardcoded 3000 caused 3000→3001 fallback.
    port: Number(process.env.PORT) || 3006,
    strictPort: true,
    open: true,
  },
  build: {
    outDir: 'build',
    sourcemap: true,
  },
});
