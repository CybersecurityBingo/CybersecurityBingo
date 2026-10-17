import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, Vite serves the React app on 5173 and forwards 
// api requests to Flask on :5001, so the browser sees one origin (no CORS).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // lets phones on the Wi-Fi open the app on the dev machine
    proxy: {
      // Node can resolve localhost to the IPv6 address ::1, which Flask (listening on IPv4) never answers.
      '/api': 'http://127.0.0.1:5001',
    },
  },
})
