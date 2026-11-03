import { useEffect, useMemo, useState } from 'react'
import type * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import ChurchModel from '../map3d/ChurchModel.tsx'
import LocalEnvironment from '../quality/LocalEnvironment.tsx'
import { plasterMaterial } from '../quality/materials.ts'
import GraphicsBoundary from '../map3d/GraphicsBoundary.tsx'
import { styleFor, type ChurchStyle } from '../map3d/churchStyles.ts'
import { churchTop, typologyScale } from '../map3d/churchBuilder.ts'
import { TYPOLOGY_META } from '../map3d/kit/typologies.ts'
import { AUTHORED, authoredScale } from '../map3d/kit/registry.ts'
import { hasWebGL } from '../map3d/webgl.ts'
import { plaqueTexture, PLAQUE_H, PLAQUE_W } from '../map3d/plaque.ts'

const grass = plasterMaterial('#6b6b6b')

interface Props { id: string; name: string; modelUrl: string | null }

/** The inscription at the foot of the church: its sigil and its name on a dark plaque. */
function Plaque({ name, front }: { name: string; front: number }) {
  const [map, setMap] = useState<THREE.CanvasTexture | null>(null)
  useEffect(() => {
    let alive = true
    plaqueTexture(name).then((t) => { if (alive) setMap(t); else t?.dispose() }).catch(() => { /* no plaque */ })
    return () => { alive = false }
  }, [name])
  // Freed only after the mesh has stopped using it (this cleanup runs once the next texture is committed).
  useEffect(() => () => { map?.dispose() }, [map])
  if (!map) return null
  return (
    <mesh position={[0.3, 0.34, Math.min(front + 0.5, 7)]} rotation={[-0.28, 0, 0]}>
      <planeGeometry args={[PLAQUE_W, PLAQUE_H]} />
      <meshBasicMaterial map={map} toneMapped={false} />
    </mesh>
  )
}

function Unavailable() {
  return <p className="p-4 text-center" role="status" style={{ color: 'var(--ink-dim)' }}>La vista 3D no está disponible en este dispositivo.</p>
}

/** What the camera needs to know about a church: where its front is and how tall it stands, in scene units. */
export function frameFromBox(box: THREE.Box3): { front: number; height: number; width: number } {
  // An uploaded scan is centred and scaled by normalizeModel; its facing is assumed to be +z, the convention of the kit.
  return { front: box.max.z, height: box.max.y, width: box.max.x - box.min.x }
}

export function frameOf(style: ChurchStyle): { front: number; height: number; width: number } {
  if (style.authored) { const a = AUTHORED[style.authored]; const k = authoredScale(style.authored); return { front: (a.length * k) / 2, height: a.height * k, width: a.width * k } }
  const meta = TYPOLOGY_META[style.typology]
  const k = typologyScale(style)
  return { front: (meta.length * k) / 2, height: churchTop(style), width: meta.width * k }
}

/**
 * The camera stands low in front of the church, a little to one side (about 30 degrees), and looks up so that the
 * line to the top of the facade rises at about 45 degrees. It is set once: the view never turns.
 */
function FrontView({ front, height, width }: { front: number; height: number; width: number }) {
  const camera = useThree((t) => t.camera) as THREE.PerspectiveCamera
  const aspect = useThree((t) => t.size.width / Math.max(t.size.height, 1))
  useEffect(() => {
    // Horizontal distance: about the height (so the top is some 45 degrees up), and enough to take in a wide facade.
    // In a tall, narrow frame the sides are the limit, so the camera backs off by the aspect.
    const reach = Math.max(height * 1.15, (width * 1.3) / Math.min(1, aspect), 2)
    const azimuth = (25 * Math.PI) / 180
    camera.fov = 68
    camera.position.set(Math.sin(azimuth) * reach, 0.4, front + Math.cos(azimuth) * reach)
    camera.lookAt(0, height * 0.52, front * 0.55)
    camera.updateProjectionMatrix()
  }, [camera, front, height, width, aspect])
  return null
}
/**
 * Close-up of the front of one church, seen from below: the camera is low and near and looks up at about 45 degrees, so
 * the portal and the towers fill the frame. It does not turn and cannot be dragged.
 */
export default function ChurchStage(props: Props) {
  if (!hasWebGL()) return <Unavailable />
  return <Stage {...props} />
}

function Stage({ id, name, modelUrl }: Props) {
  // Memoised: a new style object on every render would rebuild the whole church.
  const style = useMemo(() => styleFor({ id }), [id])
  const [scan, setScan] = useState<THREE.Box3 | null>(null)
  const frame = useMemo(() => (scan ? frameFromBox(scan) : frameOf(style)), [scan, style])
  return (
    <GraphicsBoundary fallback={<Unavailable />}>
      <Canvas shadows="soft" camera={{ position: [2, 0.4, 9], fov: 68, near: 0.1, far: 80 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}
        role="img" aria-label={`Modelo 3D de ${name}`}>
        <LocalEnvironment intensity={0.8} />
        <hemisphereLight args={['#f2f2f2', '#3a3a3a', 0.55]} />
        <directionalLight position={[8, 14, 10]} intensity={1.7} color="#ffffff" castShadow shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={12} shadow-camera-bottom={-12} shadow-bias={-0.0005} />
        <mesh position={[0, -0.3, 0]} receiveShadow material={grass}>
          <cylinderGeometry args={[6.2, 6.5, 0.6, 64]} />
        </mesh>
        <mesh position={[0, -0.28, 0]}>
          <cylinderGeometry args={[6.5, 6.9, 0.4, 64]} />
          <meshStandardMaterial color="#2c2c2c" roughness={0.95} />
        </mesh>
        <ChurchModel modelUrl={modelUrl} style={style} onScan={setScan} />
        <Plaque name={name} front={frame.front} />
        <FrontView front={frame.front} height={frame.height} width={frame.width} />
      </Canvas>
    </GraphicsBoundary>
  )
}
