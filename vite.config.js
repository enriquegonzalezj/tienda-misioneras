import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
    // tailwindcss() genera el CSS de las clases que usamos en los .jsx.
    plugins: [react(), tailwindcss()],
    server: {
        port: 3000,
        // En desarrollo, todo lo que empiece por /api se reenvía a Flask.
        // Así el frontend usa siempre rutas relativas (/api/...) y no hace falta CORS.
        proxy: {
            '/api': 'http://127.0.0.1:3001'
        }
    },
    build: {
        outDir: 'dist'
    }
})
