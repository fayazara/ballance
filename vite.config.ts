import react from '@vitejs/plugin-react'
import { defineConfig, type ViteDevServer } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { resolve, sep, extname } from 'node:path'
import {ivpAssets} from './scripts/ivp-assets.ts'

// Development serves the local pack directly; the deploy script stages it after building.
export default defineConfig(async ({command})=>({
  plugins: [react(), await ivpAssets(command), {
    name: 'local-original-game-assets',
    configureServer(server:ViteDevServer) {
      // Development reads the current local SDK build; production emits a versioned pair.
      server.middlewares.use('/ivp', async (req,res)=> {
        const name=(req.url||'').split('?')[0]
        if(name!=='/ivp-simulation.mjs'&&name!=='/ivp-simulation.wasm') {res.statusCode=404;res.end();return}
        try {
          const path=resolve('.local/ivp-simulation',name.slice(1));await stat(path)
          res.setHeader('Content-Type',name.endsWith('.mjs')?'text/javascript':'application/wasm')
          createReadStream(path).on('error',()=>res.destroy()).pipe(res)
        } catch {res.statusCode=404;res.end('Build the local IVP module first')}
      })
      const root = resolve('.local/original')
      server.middlewares.use('/original', async (req, res) => {
        try {
          const path = resolve(root, '.' + decodeURIComponent((req.url || '/').split('?')[0]!))
          if (!path.startsWith(root + sep) || !(await stat(path)).isFile()) { res.statusCode = 404; res.end(); return }
          const types: Record<string, string> = { '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4' }
          res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream')
          createReadStream(path).on('error', () => res.destroy()).pipe(res)
        } catch { res.statusCode = 404; res.end() }
      })
    },
  }, cloudflare()],
}))
