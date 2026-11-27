import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { searchMetadata } from './scripts/search-metadata';

// The site has three pages that sit side by side: the main page, the deep dive,
// and the placeholder shown for links that are not public yet.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), searchMetadata(loadEnv(mode, process.cwd(), 'VITE_'))],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: {
    // "npm run build:linked" sets MV_LINK_PUBLIC and links the files of public/ into dist/ itself,
    // so that a machine with little disk space does not hold the site's data twice.
    copyPublicDir: process.env.MV_LINK_PUBLIC !== '1',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        'deep-dive': path.resolve(__dirname, 'deep-dive.html'),
        'coming-soon': path.resolve(__dirname, 'coming-soon.html'),
      },
    },
  },
}));
