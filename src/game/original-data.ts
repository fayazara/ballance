import * as THREE from 'three'
export const SCALE = 0.25
export interface OriginalObject { id: number; name: string; mesh: number; matrix: number[]; visible: boolean }
export interface OriginalMesh { id: number; name?: string; positions: number[]; normals: number[]; uvs: number[]; indices: number[]; faceMaterials: number[]; materials: number[] }
export interface OriginalDocument {
  objects: OriginalObject[]; meshes: OriginalMesh[]
  materials: { id: number; name: string; emissive: number[]; texture: number; diffuse: number[]; AlphaBlendEnabled: boolean; AlphaTestEnabled: boolean; TwoSidedEnabled: boolean; ZWriteEnabled: boolean }[]
  textures: { id: number; file: string }[]; groups: { name: string; members: number[] }[]
}
/** Invisible collision-only floors still participate in physics. */
export function originalSceneEntries(document: OriginalDocument) {
  const floors=new Set(document.groups.filter(g=>/^Phys_Floor/.test(g.name)).flatMap(g=>g.members))
  const hidden=new Set(document.groups.filter(g=>g.name==='invisible' || g.name==='DepthTestCubes').flatMap(g=>g.members))
  const meshes=new Map(document.meshes.map(m=>[m.id,m]))
  return document.objects.flatMap(object=> {
    const source=meshes.get(object.mesh), floor=floors.has(object.id)
    if(!source?.indices.length || /^(PR_|PS_|PC_|P_Extra_|SkyLayer)/.test(object.name) || hidden.has(object.id) && !floor) return []
    return [{ object, source, floor, visible:object.visible && !hidden.has(object.id) }]
  })
}
export const originalPosition = (o: OriginalObject) => new THREE.Vector3(o.matrix[12]! * SCALE, o.matrix[13]! * SCALE, -o.matrix[14]! * SCALE)
export function originalGeometry(mesh: OriginalMesh, matrix: number[], relative = false) {
  const transform = new THREE.Matrix4().fromArray(matrix)
  if (relative) transform.setPosition(0, 0, 0)
  transform.premultiply(new THREE.Matrix4().makeScale(SCALE, SCALE, -SCALE))
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.normals, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(mesh.uvs.map((v, i) => i % 2 ? 1 - v : v), 2))
  const indices = mesh.indices.slice()
  for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2]!, indices[i + 1]!]
  geometry.setIndex(indices); geometry.applyMatrix4(transform)
  let start = 0
  for (let i = 1; i <= mesh.faceMaterials.length; i++) {
    if (i === mesh.faceMaterials.length || mesh.faceMaterials[i] !== mesh.faceMaterials[start]) {
      geometry.addGroup(start * 3, (i - start) * 3, mesh.faceMaterials[start]); start = i
    }
  }
  geometry.computeBoundingBox(); geometry.computeBoundingSphere()
  return geometry
}
export async function loadOriginal(name: string): Promise<OriginalDocument> {
  const response = await fetch(`/original/${name}.json`)
  if (!response.ok) throw new Error(`Original asset ${name} is unavailable (${response.status})`)
  return response.json()
}
export class OriginalMaterials {
  textures: THREE.Texture[] = []; materials: THREE.MeshPhongMaterial[] = []
  async create(document: OriginalDocument) {
    const textures = new Map<number, THREE.Texture>()
    await Promise.all(document.textures.map(async t => {
      const texture = await new THREE.TextureLoader().loadAsync(`/original/${t.file}`)
      texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 8
      textures.set(t.id, texture); this.textures.push(texture)
    }))
    return new Map(document.materials.map(m => {
      const material = new THREE.MeshPhongMaterial({ map: textures.get(m.texture) ?? null, color: new THREE.Color(m.diffuse[0], m.diffuse[1], m.diffuse[2]), emissive: new THREE.Color(m.emissive[0], m.emissive[1], m.emissive[2]), emissiveMap: textures.get(m.texture) ?? null, shininess: 8, specular: 0x222222, transparent: m.AlphaBlendEnabled, alphaTest: m.AlphaTestEnabled ? 0.4 : 0, opacity: m.diffuse[3], depthWrite: m.ZWriteEnabled, side: m.TwoSidedEnabled ? THREE.DoubleSide : THREE.FrontSide })
      if (m.name === 'Laterne_Verlauf') { material.blending = THREE.AdditiveBlending; material.depthWrite = false; material.alphaTest = 0; material.emissiveIntensity = 2 }
      material.name = m.name
      this.materials.push(material); return [m.id, material]
    }))
  }
  dispose() { this.textures.forEach(t => t.dispose()); this.materials.forEach(m => m.dispose()) }
}
