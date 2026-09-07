import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { resolve, sep, extname } from 'node:path'

// Development serves the local pack directly; the deploy script stages it after building.
export default defineConfig({
  plugins: [react(), {
    name: 'local-original-game-assets',
    configureServer(server) {
      const root = resolve('.local/original')
      server.middlewares.use('/original', async (req, res) => {
        try {
          const path = resolve(root, '.' + decodeURIComponent((req.url || '/').split('?')[0]!))
          if (!path.startsWith(root + sep) || !(await stat(path)).isFile()) { res.statusCode = 404; res.end(); return }
          const types: Record<string, string> = { '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg' }
          res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream')
          createReadStream(path).on('error', () => res.destroy()).pipe(res)
        } catch { res.statusCode = 404; res.end() }
      })
    },
  }, cloudflare()],
})
