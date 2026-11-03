import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import ChurchModel from '../map3d/ChurchModel.tsx'
import LocalEnvironment from '../quality/LocalEnvironment.tsx'
import { plasterMaterial } from '../quality/materials.ts'
import GraphicsBoundary from '../map3d/GraphicsBoundary.tsx'
import { styleFor } from '../map3d/churchStyles.ts'
import { hasWebGL } from '../map3d/webgl.ts'

const grass = plasterMaterial('#6b6b6b')

interface Props { id: string; name: string; modelUrl: string | null }

function Unavailable() {
  return <p className="p-4 text-center" role="status" style={{ color: 'var(--ink-dim)' }}>La vista 3D no está disponible en este dispositivo.</p>
}

/** Close-up of one church on a round stage. Drag to turn it around; it also turns slowly by itself. */
export default function ChurchStage({ id, name, modelUrl }: Props) {
  if (!hasWebGL()) return <Unavailable />
  // Memoised: a new style object on every render would rebuild the whole church.
  const style = useMemo(() => styleFor({ id }), [id])
  return (
    <GraphicsBoundary fallback={<Unavailable />}>
      <Canvas shadows="soft" camera={{ position: [10, 6.5, 13], fov: 38 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}
        aria-label={`Modelo 3D de ${name}`}>
        <LocalEnvironment intensity={0.8} />
        <hemisphereLight args={['#f2f2f2', '#3a3a3a', 0.55]} />
        <directionalLight position={[8, 14, 10]} intensity={2.4} color="#ffffff" castShadow shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={12} shadow-camera-bottom={-12} shadow-bias={-0.0005} />
        <mesh position={[0, -0.3, 0]} receiveShadow material={grass}>
          <cylinderGeometry args={[9, 9.4, 0.6, 64]} />
        </mesh>
        <mesh position={[0, -0.28, 0]}>
          <cylinderGeometry args={[9.4, 9.8, 0.4, 64]} />
          <meshStandardMaterial color="#2c2c2c" roughness={0.95} />
        </mesh>
        <ChurchModel modelUrl={modelUrl} style={style} />
        <OrbitControls autoRotate autoRotateSpeed={1.1} enablePan={false} enableDamping minDistance={9} maxDistance={26}
          minPolarAngle={0.5} maxPolarAngle={1.45} target={[0, 2.2, 0]} />
      </Canvas>
    </GraphicsBoundary>
  )
}
