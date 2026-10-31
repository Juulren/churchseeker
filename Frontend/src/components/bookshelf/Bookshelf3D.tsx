import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, useCursor } from '@react-three/drei'
import * as THREE from 'three'
import GraphicsBoundary from '../map3d/GraphicsBoundary.tsx'
import { hasWebGL } from '../map3d/webgl.ts'
import { ROW_HEIGHT, layoutShelf, type BookSlot, type ShelfBook } from './shelfLayout.ts'

interface Props {
  books: ShelfBook[]
  hoveredId: string | null
  onHover: (id: string | null) => void
  onOpen: (id: string) => void
}

const WOOD = '#5a3b22'
const PLANK = '#7a5230'
const GOLD = '#e0b04a'

function Book({ slot, hovered, onHover, onOpen }: { slot: BookSlot } & Pick<Props, 'onHover' | 'onOpen'> & { hovered: boolean }) {
  const group = useRef<THREE.Group>(null)
  useCursor(hovered)
  useFrame((_, dt) => {
    const g = group.current
    if (!g) return
    // The hovered book slides out of the shelf, lifts a little and turns toward the viewer.
    g.position.z = THREE.MathUtils.damp(g.position.z, hovered ? 0.7 : 0, 9, dt)
    g.position.y = THREE.MathUtils.damp(g.position.y, slot.y + slot.h / 2 + (hovered ? 0.12 : 0), 9, dt)
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, hovered ? -0.22 : 0, 9, dt)
  })
  const { w, h, d } = slot
  return (
    <group
      ref={group}
      position={[slot.x, slot.y + h / 2, 0]}
      rotation={[0, 0, slot.tilt]}
      onPointerOver={(e) => { e.stopPropagation(); onHover(slot.id) }}
      onPointerOut={() => onHover(null)}
      onClick={(e) => { e.stopPropagation(); onOpen(slot.id) }}
    >
      <mesh>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={slot.color} flatShading />
      </mesh>
      {/* gold bands, label plate and, for private books, a clasp */}
      {[1, -1].map((s) => (
        <mesh key={s} position={[0, s * (h / 2 - 0.13), 0]}>
          <boxGeometry args={[w + 0.02, 0.07, d + 0.02]} />
          <meshStandardMaterial color={GOLD} flatShading />
        </mesh>
      ))}
      <mesh position={[0, h * 0.08, d / 2 + 0.006]}>
        <boxGeometry args={[w * 0.78, h * 0.34, 0.02]} />
        <meshStandardMaterial color="#efe2bf" flatShading />
      </mesh>
      {!slot.isPublic && (
        <mesh position={[0, -h * 0.3, d / 2 + 0.01]}>
          <boxGeometry args={[w * 0.55, 0.2, 0.04]} />
          <meshStandardMaterial color="#2b2b2b" emissive={GOLD} emissiveIntensity={0.5} flatShading />
        </mesh>
      )}
      {hovered && (
        <Html position={[0, h / 2 + 0.55, d / 2]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
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
  return (
    <>
      <hemisphereLight args={['#fff1d0', '#4a3a28', 1.1]} />
      <directionalLight position={[3, 8, 12]} intensity={1.5} color="#ffe4b0" />
      <FitCamera width={shelfW} rows={Math.max(rows, 1)} />
      {Array.from({ length: Math.max(rows, 1) }, (_, r) => (
        <mesh key={r} position={[0, -r * ROW_HEIGHT - 0.15, 0.1]}>
          <boxGeometry args={[shelfW, 0.3, 1.9]} />
          <meshStandardMaterial color={PLANK} flatShading />
        </mesh>
      ))}
      <mesh position={[0, -((Math.max(rows, 1) - 1) * ROW_HEIGHT) / 2 + 1.1, -0.9]}>
        <boxGeometry args={[shelfW, Math.max(rows, 1) * ROW_HEIGHT + 0.3, 0.12]} />
        <meshStandardMaterial color={WOOD} flatShading />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (shelfW / 2 + 0.1), -((Math.max(rows, 1) - 1) * ROW_HEIGHT) / 2 + 1.1, 0.1]}>
          <boxGeometry args={[0.22, Math.max(rows, 1) * ROW_HEIGHT + 0.3, 1.9]} />
          <meshStandardMaterial color={WOOD} flatShading />
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
  const height = Math.min(520, Math.max(220, 200 + (rows - 1) * 150))
  return (
    <GraphicsBoundary fallback={null}>
      <div style={{ height }} className="overflow-hidden" aria-hidden="true">
        <Canvas camera={{ fov: 35, position: [0, 1, 12] }} dpr={[1, 1.5]} gl={{ antialias: false, alpha: true }}>
          <Scene {...props} />
        </Canvas>
      </div>
    </GraphicsBoundary>
  )
}
