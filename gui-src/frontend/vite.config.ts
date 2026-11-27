import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
export default defineConfig({
  root,
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.join(root, 'src'),
      '@shared': path.join(root, 'src'),
      react: path.join(root, '../node_modules/react'),
      'react-dom': path.join(root, '../node_modules/react-dom'),
      'lucide-react': path.join(root, '../node_modules/lucide-react'),
    },
  },
  build: { outDir: path.join(root, '../../public/gui'), emptyOutDir: true, sourcemap: false },
})
