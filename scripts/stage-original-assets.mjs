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
    if (!entry.isFile() || !['.json', '.png', '.jpg', '.ogg', '.m4a'].includes(extname(path))) continue
    if ((await stat(join(source, path))).size > 25 * 1024 * 1024) throw new Error(`Asset exceeds Workers file limit: ${path}`)
    await cp(join(source, path), join('dist/client/original', path))
    count++
  }
}
await stage()
console.log(`Staged ${count} converted game assets for deployment.`)

// A content-addressed manifest lets the offline downloader verify every file.
const {readFile,writeFile}=await import('node:fs/promises')
const {createHash}=await import('node:crypto')
const files=[]
async function list(relative='') {
  for(const entry of await readdir(join('dist/client',relative),{withFileTypes:true})) {
    const path=join(relative,entry.name)
    if(entry.isDirectory()){await list(path);continue}
    if(entry.name.startsWith('.')||['sw.js','offline-manifest.json','_headers'].includes(entry.name))continue
    const bytes=await readFile(join('dist/client',path))
    files.push({url:path==='index.html'?'/':`/${path}`,size:bytes.length,hash:createHash('sha256').update(bytes).digest('hex')})
  }
}
await list();files.sort((a,b)=>a.url.localeCompare(b.url))
const version=createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0,20)
await writeFile('dist/client/offline-manifest.json',JSON.stringify({version,files}))
await writeFile('dist/client/sw.js',(await readFile('public/sw.js','utf8')).replace('__OFFLINE_VERSION__',version))
console.log(`Offline pack: ${files.length} files, ${(files.reduce((s,f)=>s+f.size,0)/1024/1024).toFixed(1)} MB, ${version}`)
