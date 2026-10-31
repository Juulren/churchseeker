import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import ChurchModel from '../map3d/ChurchModel.tsx'
import GraphicsBoundary from '../map3d/GraphicsBoundary.tsx'
import { styleFor } from '../map3d/churchStyles.ts'
import { hasWebGL } from '../map3d/webgl.ts'

interface Props { id: string; name: string; patronSaint: string }

function Unavailable() {
  return <p className="p-4 text-center" role="status" style={{ color: 'var(--ink-dim)' }}>La vista 3D no está disponible en este dispositivo.</p>
}

/** Close-up of one church on a round stage. Drag to turn it around; it also turns slowly by itself. */
export default function ChurchStage({ id, name, patronSaint }: Props) {
  if (!hasWebGL()) return <Unavailable />
  const style = styleFor({ id })
  return (
    <GraphicsBoundary fallback={<Unavailable />}>
      <Canvas camera={{ position: [10, 6.5, 13], fov: 38 }} dpr={[1, 1.5]} gl={{ antialias: false, alpha: true }}
        aria-label={`Modelo 3D de ${name}`}>
        <hemisphereLight args={['#fff1d0', '#4a3a28', 1.2]} />
        <directionalLight position={[8, 14, 10]} intensity={1.7} color="#ffe4b0" />
        <mesh position={[0, -0.3, 0]}>
          <cylinderGeometry args={[9, 9.4, 0.6, 24]} />
          <meshStandardMaterial color="#5d7b43" flatShading />
        </mesh>
        <mesh position={[0, -0.28, 0]}>
          <cylinderGeometry args={[9.4, 9.8, 0.4, 24]} />
          <meshStandardMaterial color="#4a3320" flatShading />
        </mesh>
        <ChurchModel id={id} name={name} patronSaint={patronSaint} style={style} position={[0, 0, 0]}
          selected={false} hovered={false} showMarker={false} />
        <OrbitControls autoRotate autoRotateSpeed={1.1} enablePan={false} enableDamping minDistance={9} maxDistance={26}
          minPolarAngle={0.5} maxPolarAngle={1.45} target={[0, 2.2, 0]} />
      </Canvas>
    </GraphicsBoundary>
  )
}
