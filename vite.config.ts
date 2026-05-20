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
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      // Gun est un module CommonJS qui utilise require() en interne.
      // On le desactive du tree-shaking pour eviter l'erreur "require is not defined".
      external: [],
      output: {
        // Code splitting manuel : sépare les grosses librairies en chunks distincts
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('@xyflow'))       return 'vendor-xyflow'
            if (id.includes('simple-peer'))  return 'vendor-peer'
            if (id.includes('gun'))          return 'vendor-gun'
            if (id.includes('trystero'))     return 'vendor-trystero'
            if (id.includes('react-router')) return 'vendor-router'
            if (id.includes('react-dom') || id.includes('react/'))
                                             return 'vendor-react'
          }
        }
      }
    }
  },
  // Dire a Vite de traiter gun comme CommonJS correctement
  optimizeDeps: {
    include: ['gun', 'gun/sea']
  },
  server: {
    port: 5173
  }
})
