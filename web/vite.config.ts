import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { writeFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  return {
    plugins: [
      react(),
      tailwindcss(),
      // dist/ is embedded by the Go server; keep the placeholder git tracks there.
      {
        name: 'keep-dist-placeholder',
        closeBundle() {
          writeFileSync(fileURLToPath(new URL('./dist/.gitkeep', import.meta.url)), '')
        },
      },
    ],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      proxy: {
        '/api': {
          target: env.VITE_API_TARGET || 'http://127.0.0.1:8083',
          changeOrigin: true,
        },
      },
    },
  }
})
