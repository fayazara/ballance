import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { originalInertiaKey, originalInertiaScale } from '../src/game/original-inertia-frame.ts'
import type { OriginalDocument } from '../src/game/original-data.ts'

const pack = process.argv[2] || '.local/original'
const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'))
if (process.argv.includes('--fragments')) {
  const doc = read(`${pack}/balls.json`) as OriginalDocument
  const cases = doc.objects.filter(o => /^Ball_(Wood|Stone|Paper)_piece/i.test(o.name)).map(object => {
    const matrix = new THREE.Matrix4().fromArray(object.matrix)
    const hulls = [doc.meshes.find(m => m.id === object.mesh)!.name!]
    return { key: originalInertiaKey(hulls, matrix), hulls, scale: originalInertiaScale(matrix), placements: [] }
  })
  process.stdout.write(JSON.stringify(cases)); process.exit(0)
}
type Definition = { asset: string; target: string; hulls: string[] }
const definitions: Definition[] = []
function walk(value: unknown, asset?: string) {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) { value.forEach(v => walk(v, asset)); return }
  const data = value as Record<string, unknown>
  if (typeof data.source === 'string') asset = data.source.replace('.nmo', '').toLowerCase()
  if (Array.isArray(data.hulls) && typeof data.target === 'string' && asset) definitions.push({ asset, target: data.target, hulls: data.hulls as string[] })
  Object.values(data).forEach(v => walk(v, asset))
}
for (const name of ['hinge', 'lift', 'arms', 'swing', 'sack', 'chain', 'slider']) walk(read(`src/game/original-${name}-data.json`))
definitions.push({ asset: 'p_modul_01', target: 'P_Modul_01_Pusher', hulls: [1,2,3].map(i => `P_Modul_01_Col0${i}_Mesh`) })
for (const asset of ['p_box', 'p_ball_paper']) {
  const doc = read(`${pack}/${asset}.json`) as OriginalDocument
  const object = doc.objects.find(o => o.name.toLowerCase() === `${asset}_mf`)!
  definitions.push({ asset, target: object.name, hulls: [doc.meshes.find(m => m.id === object.mesh)!.name!] })
}
const cases = new Map<string, { key: string; hulls: string[]; scale: number[]; placements: string[] }>()
for (const definition of definitions) {
  const doc = read(`${pack}/${definition.asset}.json`) as OriginalDocument
  const object = doc.objects.find(o => o.name === definition.target)!
  const matrix = new THREE.Matrix4().fromArray(object.matrix)
  const key = originalInertiaKey(definition.hulls, matrix)
  cases.set(key, { key, hulls: definition.hulls, scale: originalInertiaScale(matrix), placements: [] })
}
for (let level = 1; level <= 12; level++) {
  const course = read(`${pack}/level_${String(level).padStart(2, '0')}.json`) as OriginalDocument
  for (const definition of definitions) {
    const doc = read(`${pack}/${definition.asset}.json`) as OriginalDocument
    const object = doc.objects.find(o => o.name === definition.target)!
    for (const parent of course.objects.filter(o => o.name.toLowerCase().startsWith(`${definition.asset}_`))) {
      const matrix = new THREE.Matrix4().fromArray(parent.matrix).multiply(new THREE.Matrix4().fromArray(object.matrix))
      const key = originalInertiaKey(definition.hulls, matrix)
      const value = cases.get(key) || { key, hulls: definition.hulls, scale: originalInertiaScale(matrix), placements: [] }
      value.placements.push(`${level}:${parent.name}:${object.name}`)
      cases.set(key, value)
    }
  }
}
process.stdout.write(JSON.stringify([...cases.values()]))
