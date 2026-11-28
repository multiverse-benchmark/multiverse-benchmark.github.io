import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { searchMetadata } from './scripts/search-metadata';

/**
 * The validation leaderboard the page draws is the baselines with the
 * submitted entries (submissions/) added. scripts/build_board.py writes it to
 * src/data, and it is not committed, so every build and every start of the
 * development server writes it first: the board always equals the committed
 * submissions.
 */
function leaderboardBoard(): Plugin {
  return {
    name: 'multiverse-leaderboard-board',
    enforce: 'pre',
    config() {
      execFileSync('python3', [path.resolve(__dirname, 'scripts/build_board.py')], { stdio: 'inherit' });
    },
  };
}

// The site has three pages that sit side by side: the main page, the deep dive,
// and the placeholder shown for links that are not public yet.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [leaderboardBoard(), react(), searchMetadata(loadEnv(mode, process.cwd(), 'VITE_'))],
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
