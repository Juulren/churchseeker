import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, useCursor } from '@react-three/drei'
import * as THREE from 'three'
import type { ChurchStyle } from './churchStyles.ts'

interface Props {
  id: string
  name: string
  patronSaint: string
  style: ChurchStyle
  position: [number, number, number]
  selected: boolean
  hovered: boolean
  /** Hide the floating marker and label (used by the close-up view). */
  showMarker?: boolean
  onSelect?: (id: string) => void
  onHover?: (id: string | null) => void
}

const DARK = '#2b1d14'

function Block({ pos, size, color, rotY = 0 }: { pos: [number, number, number]; size: [number, number, number]; color: string; rotY?: number }) {
  return (
    <mesh position={pos} rotation={[0, rotY, 0]}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} flatShading />
    </mesh>
  )
}

function Pyramid({ pos, radius, height, color }: { pos: [number, number, number]; radius: number; height: number; color: string }) {
  return (
    <mesh position={pos} rotation={[0, Math.PI / 4, 0]}>
      <coneGeometry args={[radius, height, 4]} />
      <meshStandardMaterial color={color} flatShading />
    </mesh>
  )
}

function Gable({ width, rise, length, color, y }: { width: number; rise: number; length: number; color: string; y: number }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(-width / 2 - 0.15, 0)
    shape.lineTo(width / 2 + 0.15, 0)
    shape.lineTo(0, rise)
    shape.closePath()
    const g = new THREE.ExtrudeGeometry(shape, { depth: length + 0.3, bevelEnabled: false })
    g.translate(0, 0, -(length + 0.3) / 2)
    return g
  }, [width, rise, length])
  return (
    <mesh position={[0, y, 0]} geometry={geometry}>
      <meshStandardMaterial color={color} flatShading />
    </mesh>
  )
}

function Tower({ x, z, size, height, style }: { x: number; z: number; size: number; height: number; style: ChurchStyle }) {
  return (
    <group position={[x, 0, z]}>
      <Block pos={[0, height / 2, 0]} size={[size, height, size]} color={style.wall} />
      <Block pos={[0, height * 0.72, 0]} size={[size + 0.12, 0.12, size + 0.12]} color={style.trim} />
      {/* belfry openings on the four sides */}
      {[0, 1, 2, 3].map((i) => (
        <Block key={i} pos={[Math.sin((i * Math.PI) / 2) * (size / 2 + 0.01), height * 0.86, Math.cos((i * Math.PI) / 2) * (size / 2 + 0.01)]}
          size={[i % 2 ? 0.05 : size * 0.38, height * 0.2, i % 2 ? size * 0.38 : 0.05]} color={DARK} />
      ))}
      <Pyramid pos={[0, height + size * 0.55, 0]} radius={size * 0.78} height={size * 1.1} color={style.roof} />
      <Block pos={[0, height + size * 1.18, 0]} size={[0.07, 0.42, 0.07]} color={style.trim} />
      <Block pos={[0, height + size * 1.28, 0]} size={[0.24, 0.07, 0.07]} color={style.trim} />
    </group>
  )
}

/**
 * Procedural low-poly church. Facade faces +z (south). The look comes from the style, so each church has
 * its own silhouette without needing a model file.
 */
export default function ChurchModel({ id, name, patronSaint, style, position, selected, hovered, showMarker = true, onSelect, onHover }: Props) {
  const group = useRef<THREE.Group>(null)
  const gem = useRef<THREE.Mesh>(null)
  useCursor(hovered && !!onSelect)

  const { width: w, length: l, height: h } = style
  const tw = Math.max(1.1, w * 0.3)
  const towerH = h * 1.9
  const top = Math.max(h + w * 0.35, towerH + tw * 1.4)

  useFrame((state, dt) => {
    const g = group.current
    if (g) {
      const target = hovered || selected ? 1.07 : 1
      g.scale.setScalar(THREE.MathUtils.damp(g.scale.x, target, 8, dt))
    }
    if (gem.current) {
      gem.current.rotation.y += dt * 1.6
      gem.current.position.y = top + 1.1 + Math.sin(state.clock.elapsedTime * 2) * 0.18
    }
  })

  return (
    <group
      position={position}
      onPointerOver={onHover ? (e) => { e.stopPropagation(); onHover(id) } : undefined}
      onPointerOut={onHover ? () => onHover(null) : undefined}
      onClick={onSelect ? (e) => { e.stopPropagation(); onSelect(id) } : undefined}
    >
      <group ref={group}>
        {/* plaza and plinth */}
        <mesh position={[0, 0.06, 0.6]}>
          <cylinderGeometry args={[Math.max(w, l) * 0.78, Math.max(w, l) * 0.82, 0.12, 12]} />
          <meshStandardMaterial color="#cdbf9d" flatShading />
        </mesh>
        <Block pos={[0, 0.2, 0]} size={[w + 0.9, 0.16, l + 0.9]} color="#b7a888" />

        {/* nave and gabled roof */}
        <Block pos={[0, h / 2 + 0.25, 0]} size={[w, h, l]} color={style.wall} />
        <Gable width={w} rise={w * 0.32} length={l} color={style.roof} y={h + 0.25} />

        {/* facade door and window */}
        <Block pos={[0, 0.25 + h * 0.3, l / 2 + 0.02]} size={[w * 0.26, h * 0.6, 0.06]} color={DARK} />
        <Block pos={[0, 0.25 + h * 0.78, l / 2 + 0.02]} size={[w * 0.12, h * 0.2, 0.06]} color={style.trim} />

        {/* towers */}
        {style.towers === 2 && (
          <>
            <Tower x={-(w / 2 - tw / 2)} z={l / 2 - tw / 2} size={tw} height={towerH} style={style} />
            <Tower x={w / 2 - tw / 2} z={l / 2 - tw / 2} size={tw} height={towerH} style={style} />
          </>
        )}
        {style.towers === 1 && <Tower x={-(w / 2 - tw / 2)} z={l / 2 - tw / 2} size={tw} height={towerH} style={style} />}

        {/* dome over the crossing */}
        {style.dome && (
          <group position={[0, h + 0.25, -l * 0.12]}>
            <mesh position={[0, 0.35, 0]}>
              <cylinderGeometry args={[w * 0.28, w * 0.3, 0.7, 8]} />
              <meshStandardMaterial color={style.trim} flatShading />
            </mesh>
            <mesh position={[0, 0.7, 0]}>
              <sphereGeometry args={[w * 0.28, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshStandardMaterial color={style.roof} flatShading />
            </mesh>
          </group>
        )}

        {/* open portico of arches in front of the facade */}
        {style.arches > 0 &&
          Array.from({ length: style.arches }, (_, i) => {
            const x = ((i + 0.5) / style.arches - 0.5) * (w + 0.6)
            return (
              <group key={i} position={[x, 0, l / 2 + 0.7]}>
                <Block pos={[0, 0.25 + h * 0.3, 0]} size={[0.16, h * 0.6, 0.16]} color={style.trim} />
                <Block pos={[0, 0.25 + h * 0.62, 0]} size={[(w + 0.6) / style.arches, 0.14, 0.3]} color={style.trim} />
              </group>
            )
          })}

        {/* cross on the gable */}
        <Block pos={[0, h + w * 0.32 + 0.5, l / 2 - 0.2]} size={[0.07, 0.5, 0.07]} color={style.trim} />
        <Block pos={[0, h + w * 0.32 + 0.62, l / 2 - 0.2]} size={[0.26, 0.07, 0.07]} color={style.trim} />
      </group>

      {showMarker && (
        <>
          <mesh ref={gem} position={[0, top + 1.1, 0]}>
            <octahedronGeometry args={[0.38, 0]} />
            <meshStandardMaterial color="#ffd36b" emissive="#ff9d1c" emissiveIntensity={selected || hovered ? 1.6 : 0.8} flatShading />
          </mesh>
          {(hovered || selected) && (
            <Html position={[0, top + 2.2, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
              <div className="rpg-panel whitespace-nowrap px-3 py-1 text-center" style={{ fontSize: 16 }}>
                <div style={{ color: 'var(--accent)' }}>{name}</div>
                <div style={{ color: 'var(--ink-dim)', fontSize: 13 }}>{patronSaint}</div>
              </div>
            </Html>
          )}
        </>
      )}
    </group>
  )
}
