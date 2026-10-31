import { useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { PublicChurch } from '../../services/types.ts'
import CameraRig from './CameraRig.tsx'
import ChurchModel from './ChurchModel.tsx'
import GraphicsBoundary from './GraphicsBoundary.tsx'
import MeridaTerrain from './MeridaTerrain.tsx'
import { styleFor } from './churchStyles.ts'
import { centroid, focusPose, overviewPose, project, validCoordinates } from './projection.ts'
import { hasWebGL } from './webgl.ts'

interface Props {
  churches: PublicChurch[]
  selectedId: string | null
  hoveredId: string | null
  onSelect: (id: string) => void
  onHover: (id: string | null) => void
}

const HALF = 38

function Unavailable() {
  return (
    <div className="rpg-panel absolute left-1/2 top-1/2 max-w-sm -translate-x-1/2 -translate-y-1/2 p-4 text-center" role="status">
      El mapa 3D no está disponible en este dispositivo. Usa la lista de iglesias para continuar.
    </div>
  )
}

/** Interactive island map of Mérida with a low-poly 3D model for every church. */
export default function MeridaMap({ churches, selectedId, hoveredId, onSelect, onHover }: Props) {
  const controls = useRef<OrbitControlsImpl>(null)
  const [contextLost, setContextLost] = useState(false)
  // Bumped when the GPU context comes back, to rebuild the scene from scratch.
  const [generation, setGeneration] = useState(0)

  const items = useMemo(() => {
    const valid = validCoordinates(churches.map((c) => ({ ...c, lat: c.latitude, lng: c.longitude })))
    const origin = centroid(valid)
    return valid.map((c) => ({ church: c, pos: project(c, origin), style: styleFor(c) }))
  }, [churches])

  const exclusions = useMemo(() => items.map((i) => ({ x: i.pos.x, z: i.pos.z, r: 5 })), [items])
  const selected = items.find((i) => i.church.id === selectedId)
  const pose = selected ? focusPose(selected.pos, 24) : overviewPose(items.map((i) => i.pos))

  if (!hasWebGL()) return <Unavailable />

  return (
    <div className="absolute inset-0">
      <GraphicsBoundary fallback={<Unavailable />}>
        <Canvas
          key={generation}
          camera={{ position: [0, 40, 50], fov: 42, near: 0.5, far: 400 }}
          dpr={[1, 1.5]}
          gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            const el = gl.domElement
            el.addEventListener('webglcontextlost', (e) => { e.preventDefault(); setContextLost(true) })
            el.addEventListener('webglcontextrestored', () => { setContextLost(false); setGeneration((g) => g + 1) })
          }}
        >
          <hemisphereLight args={['#fff1d0', '#4a3a28', 1.1]} />
          <directionalLight position={[40, 60, 30]} intensity={1.6} color="#ffe4b0" />
          <MeridaTerrain half={HALF} exclusions={exclusions} />
          {items.map((i) => (
            <ChurchModel
              key={i.church.id}
              id={i.church.id}
              name={i.church.name}
              patronSaint={i.church.patronSaint}
              style={i.style}
              position={[i.pos.x, 0, i.pos.z]}
              selected={i.church.id === selectedId}
              hovered={i.church.id === hoveredId}
              onSelect={onSelect}
              onHover={onHover}
            />
          ))}
          <OrbitControls
            ref={controls}
            makeDefault
            enableDamping
            enablePan={false}
            minDistance={9}
            maxDistance={130}
            minPolarAngle={0.35}
            maxPolarAngle={1.38}
          />
          <CameraRig pose={pose} controls={controls} />
        </Canvas>
      </GraphicsBoundary>
      {contextLost && (
        <div className="rpg-panel absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 p-4" role="status">
          Reiniciando los gráficos…
        </div>
      )}
    </div>
  )
}
