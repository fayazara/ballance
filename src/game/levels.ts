export type Material = 'wood' | 'stone' | 'paper'
export type Surface = { x: number; z: number; w: number; d: number; y: number; endY?: number; axis?: 'x' | 'z'; kind: 'stone' | 'wood' | 'rail' | 'fragile' }
export type Pad = { x: number; z: number; y: number; material: Material }
export type Point = { x: number; z: number; y: number }
export type Level = { name: string; subtitle: string; description: string; difficulty: string; time: number; surfaces: Surface[]; start: Point; finish: Point; checkpoints: Point[]; pads: Pad[]; coins: Point[]; crates: Point[]; fans: Point[] }
const platform = (x: number, z: number, w: number, d: number, y = 0, kind: Surface['kind'] = 'stone'): Surface => ({ x, z, w, d, y, kind })
export const levels: Level[] = [
  {
    name: 'A walk in the clouds', subtitle: 'Find your footing', difficulty: 'Gentle', time: 240,
    description: 'A quiet beginning. Follow the brass lights, feel the momentum, and find your balance.',
    start: { x: 0, z: 6, y: 0 }, finish: { x: -4, z: -29, y: 2 },
    surfaces: [platform(0, 6, 5, 5), platform(0, 0, 2.4, 8, 0, 'wood'), platform(0, -5, 4, 4), platform(5, -5, 7, 1.5, 0, 'rail'), platform(10, -5, 4, 4), { ...platform(10, -11, 2.4, 8, 0, 'wood'), endY: 2, axis: 'z' }, platform(10, -17, 5, 4, 2), platform(4, -17, 8, 1.25, 2, 'rail'), platform(-2, -17, 4, 4, 2), platform(-2, -22, 2, 7, 2, 'wood'), platform(-4, -28, 7, 6, 2)],
    checkpoints: [{ x: 10, z: -5, y: 0 }, { x: -2, z: -17, y: 2 }], pads: [], crates: [], fans: [],
    coins: [{ x: 0, z: -1, y: 0 }, { x: 4, z: -5, y: 0 }, { x: 10, z: -12, y: 1.25 }, { x: 4, z: -17, y: 2 }, { x: -2, z: -23, y: 2 }],
  },
  {
    name: 'The weight of things', subtitle: 'Change your nature', difficulty: 'Thoughtful', time: 300,
    description: 'Stone moves what wood cannot. Paper crosses fragile bridges. Let the wind carry you home.',
    start: { x: 0, z: 6, y: 0 }, finish: { x: 10, z: -29, y: 0 },
    surfaces: [platform(0, 6, 5, 5), platform(0, 0, 2.8, 8, 0, 'wood'), platform(0, -6, 5, 5), platform(6, -6, 8, 2.2, 0, 'wood'), platform(12, -6, 5, 5), platform(12, -13, 2.4, 10, 0, 'fragile'), platform(12, -20, 5, 4), platform(10, -28, 7, 6)],
    checkpoints: [{ x: 0, z: -6, y: 0 }, { x: 12, z: -6, y: 0 }, { x: 12, z: -20, y: 0 }],
    pads: [{ x: 0, z: 3, y: 0, material: 'stone' }, { x: 12, z: -6.5, y: 0, material: 'paper' }, { x: 10, z: -27.5, y: 0, material: 'wood' }],
    crates: [{ x: 0, z: -1, y: 0 }], fans: [{ x: 12, z: -21, y: 0 }],
    coins: [{ x: 5, z: -6, y: 0 }, { x: 12, z: -12, y: 0 }, { x: 12, z: -17, y: 0 }, { x: 12, z: -24, y: 2 }],
  },
  {
    name: 'A little closer to infinity', subtitle: 'Trust your momentum', difficulty: 'Daring', time: 330,
    description: 'Thin rails, rising paths, and one last leap of faith. Take your time. The sky is not going anywhere.',
    start: { x: 0, z: 6, y: 0 }, finish: { x: 0, z: -38, y: 3 },
    surfaces: [platform(0, 6, 5, 5), platform(0, -1, 1.25, 10, 0, 'rail'), platform(0, -8, 4, 4), { ...platform(6, -8, 8, 2, 0, 'wood'), endY: 3, axis: 'x' }, platform(12, -8, 4, 4, 3), platform(12, -14, 1.2, 8, 3, 'rail'), platform(12, -20, 4, 4, 3), platform(5, -20, 10, 2.2, 3, 'fragile'), platform(-2, -20, 4, 4, 3), platform(-2, -25, 2.2, 7, 3, 'wood'), platform(-2, -29, 4, 3, 3), platform(0, -37, 7, 6, 3)],
    checkpoints: [{ x: 0, z: -8, y: 0 }, { x: 12, z: -20, y: 3 }, { x: -2, z: -29, y: 3 }],
    pads: [{ x: 12, z: -20, y: 3, material: 'paper' }, { x: 0, z: -36, y: 3, material: 'wood' }],
    crates: [], fans: [{ x: -2, z: -29.8, y: 3 }],
    coins: [{ x: 0, z: -2, y: 0 }, { x: 6, z: -8, y: 1.5 }, { x: 12, z: -14, y: 3 }, { x: 5, z: -20, y: 3 }, { x: -2, z: -25, y: 3 }],
  },
]
