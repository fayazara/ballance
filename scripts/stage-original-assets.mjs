import { cp, readdir, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'

// Deployment includes the converted playable pack, never the installer or executables.
const source = '.local/original'
await stat(join(source, 'manifest.json'))
let count = 0
async function stage(relative = '') {
  for (const entry of await readdir(join(source, relative), { withFileTypes: true })) {
    const path = join(relative, entry.name)
    if (entry.isDirectory()) { await stage(path); continue }
    if (!entry.isFile() || !['.json', '.png', '.jpg', '.ogg'].includes(extname(path))) continue
    if ((await stat(join(source, path))).size > 25 * 1024 * 1024) throw new Error(`Asset exceeds Workers file limit: ${path}`)
    await cp(join(source, path), join('dist/client/original', path))
    count++
  }
}
await stage()
console.log(`Staged ${count} converted game assets for deployment.`)
