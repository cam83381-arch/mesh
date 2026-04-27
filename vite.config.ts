import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Base relative pour que Electron charge les assets depuis dist/
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Augmenter la limite d'avertissement (app Electron = pas de pb réseau)
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Code splitting manuel : sépare les grosses librairies en chunks distincts
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('@xyflow'))     return 'vendor-xyflow'
            if (id.includes('simple-peer')) return 'vendor-peer'
            if (id.includes('gun'))         return 'vendor-gun'
            if (id.includes('socket.io'))   return 'vendor-socket'
            if (id.includes('react-router')) return 'vendor-router'
            if (id.includes('react-dom') || id.includes('react/'))
                                            return 'vendor-react'
          }
        }
      }
    }
  },
  server: {
    port: 5173
  }
})
