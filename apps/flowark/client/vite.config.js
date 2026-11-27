import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: /node_modules\/(react|react-dom|scheduler)\//,
              priority: 60
            },
            {
              name: 'vendor-motion',
              test: /node_modules\/framer-motion\//,
              priority: 50
            },
            {
              name: 'vendor-icons',
              test: /node_modules\/lucide-react\//,
              priority: 40
            },
            {
              name: 'vendor-charts',
              test: /node_modules\/(recharts|d3-|victory-vendor)\//,
              priority: 30
            },
            {
              name: 'vendor-terminal',
              test: /node_modules\/@xterm\//,
              priority: 20
            },
            {
              name: 'vendor-editor',
              test: /node_modules\/(@monaco-editor|monaco-editor)\//,
              priority: 10
            }
          ]
        }
      }
    }
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3040'
    }
  }
})
