import { fileURLToPath } from 'node:url'
export default {
  content: [
    fileURLToPath(new URL('./index.html', import.meta.url)),
    fileURLToPath(new URL('./src/**/*.{js,ts,jsx,tsx}', import.meta.url)),
    fileURLToPath(new URL('../apps/*/frontend/**/*.{js,ts,jsx,tsx}', import.meta.url)),
  ],
  darkMode: 'class',
  theme: {
    extend: {},
  },
  plugins: [],
}
