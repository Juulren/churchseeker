import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, useCursor } from '@react-three/drei'
import * as THREE from 'three'
import GraphicsBoundary from '../map3d/GraphicsBoundary.tsx'
import { hasWebGL } from '../map3d/webgl.ts'
import LocalEnvironment from '../quality/LocalEnvironment.tsx'
import { woodMaterial } from '../quality/materials.ts'
import { buildBook, disposeBook } from './bookModel.ts'
import { ROW_HEIGHT, layoutShelf, type BookSlot, type ShelfBook } from './shelfLayout.ts'

interface Props {
  books: ShelfBook[]
  hoveredId: string | null
  onHover: (id: string | null) => void
  onOpen: (id: string) => void
}


function Book({ slot, hovered, onHover, onOpen }: { slot: BookSlot } & Pick<Props, 'onHover' | 'onOpen'> & { hovered: boolean }) {
  const group = useRef<THREE.Group>(null)
  useCursor(hovered)
  const model = useMemo(
    () => buildBook({ w: slot.w, h: slot.h, d: slot.d, color: slot.color, title: slot.title, author: slot.author, isPublic: slot.isPublic }),
    [slot.w, slot.h, slot.d, slot.color, slot.title, slot.author, slot.isPublic],
  )
  useEffect(() => () => disposeBook(model), [model])
  useFrame((_, dt) => {
    const g = group.current
    if (!g) return
    // The hovered book slides out of the shelf, lifts a little and turns toward the viewer.
    g.position.z = THREE.MathUtils.damp(g.position.z, hovered ? 0.7 : 0, 9, dt)
    g.position.y = THREE.MathUtils.damp(g.position.y, slot.y + slot.h / 2 + (hovered ? 0.12 : 0), 9, dt)
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, hovered ? -0.22 : 0, 9, dt)
  })
  return (
    <group
      ref={group}
      position={[slot.x, slot.y + slot.h / 2, 0]}
      rotation={[0, 0, slot.tilt]}
      onPointerOver={(e) => { e.stopPropagation(); onHover(slot.id) }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => { e.stopPropagation(); onOpen(slot.id) }}
    >
      <primitive object={model} />
      {hovered && (
        <Html position={[0, slot.h / 2 + 0.55, slot.d / 2]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div className="rpg-panel whitespace-nowrap px-3 py-1 text-center" style={{ fontSize: 15 }}>
            <div style={{ color: 'var(--accent)' }}>{slot.title}</div>
            <div style={{ color: 'var(--ink-dim)', fontSize: 12 }}>{slot.isPublic ? 'Público' : 'Privado · personal de la iglesia'}</div>
          </div>
        </Html>
      )}
    </group>
  )
}
/** Moves the camera back far enough for the whole shelf to fit, whatever its size or the canvas shape. */
function FitCamera({ width, rows }: { width: number; rows: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  useEffect(() => {
    const aspect = size.width / Math.max(size.height, 1)
    const halfH = (rows * ROW_HEIGHT) / 2 + 0.3
    const halfW = width / 2 + 0.9
    const tan = Math.tan((camera.fov * Math.PI) / 360)
    const dist = Math.max(halfH / tan, halfW / (tan * aspect)) + 0.8
    const cy = -((rows - 1) * ROW_HEIGHT) / 2 + 1
    camera.position.set(0, cy + 0.5, dist)
    camera.lookAt(0, cy, 0)
    camera.updateProjectionMatrix()
  }, [camera, size, width, rows])
  return null
}

function Scene({ books, hoveredId, onHover, onOpen }: Props) {
  const layout = useMemo(() => layoutShelf(books), [books])
  const { width, rows } = layout
  const shelfW = Math.max(width + 1.4, 4)
  const n = Math.max(rows, 1)
  const centreY = -((n - 1) * ROW_HEIGHT) / 2 + 1.1
  const plank = woodMaterial('#8a5a34', [Math.max(2, Math.round(shelfW / 2)), 1])
  const frame = woodMaterial('#5d3b21', [1, 2])
  return (
    <>
      <LocalEnvironment />
      <hemisphereLight args={['#fff6e4', '#3a2c20', 0.5]} />
      <directionalLight position={[4, 9, 12]} intensity={2.1} color="#ffeccb" castShadow shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={8} shadow-camera-bottom={-12} shadow-bias={-0.0004} />
      <pointLight position={[-6, 3, 8]} intensity={18} color="#ffd9a0" />
      <FitCamera width={shelfW} rows={n} />
      {Array.from({ length: n }, (_, r) => (
        <mesh key={r} position={[0, -r * ROW_HEIGHT - 0.15, 0.1]} material={plank} castShadow receiveShadow>
          <boxGeometry args={[shelfW, 0.3, 1.9]} />
        </mesh>
      ))}
      <mesh position={[0, centreY, -0.9]} material={frame} receiveShadow>
        <boxGeometry args={[shelfW, n * ROW_HEIGHT + 0.3, 0.12]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (shelfW / 2 + 0.1), centreY, 0.1]} material={frame} castShadow receiveShadow>
          <boxGeometry args={[0.22, n * ROW_HEIGHT + 0.3, 1.9]} />
        </mesh>
      ))}
      {layout.slots.map((s) => (
        <Book key={s.id} slot={s} hovered={hoveredId === s.id} onHover={onHover} onOpen={onOpen} />
      ))}
    </>
  )
}

export default function Bookshelf3D(props: Props) {
  if (!hasWebGL()) return null
  const rows = layoutShelf(props.books).rows
  const height = Math.min(640, Math.max(340, 330 + (rows - 1) * 190))
  return (
    <GraphicsBoundary fallback={null}>
      <div style={{ height }} className="overflow-hidden" aria-hidden="true">
        <Canvas shadows="soft" camera={{ fov: 35, position: [0, 1, 12] }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
          <Scene {...props} />
        </Canvas>
      </div>
    </GraphicsBoundary>
  )
}