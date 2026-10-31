import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { BLOCK, STREET, scatterHouses, scatterTrees, type Exclusion } from './scatter.ts'

interface Props {
  /** Half of the island's side length, in world units. */
  half: number
  /** Circles (churches) that must stay clear of houses and trees. */
  exclusions: Exclusion[]
}

const dummy = new THREE.Object3D()
const tint = new THREE.Color()

function fillInstances(mesh: THREE.InstancedMesh, items: { x: number; y: number; z: number; sx: number; sy: number; sz: number; color?: string }[]) {
  items.forEach((it, i) => {
    dummy.position.set(it.x, it.y, it.z)
    dummy.scale.set(it.sx, it.sy, it.sz)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
    if (it.color) mesh.setColorAt(i, tint.set(it.color))
  })
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}

/** The floating island: grass slab, the colonial street grid, low houses and trees. All instanced. */
export default function MeridaTerrain({ half, exclusions }: Props) {
  const houses = useMemo(() => scatterHouses(2026, half, exclusions), [half, exclusions])
  const trees = useMemo(() => scatterTrees(2026, half, 140, exclusions), [half, exclusions])
  const streetXs = useMemo(() => {
    const out: number[] = []
    for (let x = -Math.floor(half / BLOCK) * BLOCK; x <= half; x += BLOCK) out.push(x)
    return out
  }, [half])

  const houseMesh = useRef<THREE.InstancedMesh>(null)
  const trunkMesh = useRef<THREE.InstancedMesh>(null)
  const crownMesh = useRef<THREE.InstancedMesh>(null)
  const streetMesh = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    if (houseMesh.current)
      fillInstances(houseMesh.current, houses.map((h) => ({ x: h.x, y: h.h / 2, z: h.z, sx: h.w, sy: h.h, sz: h.d, color: h.color })))
    if (trunkMesh.current)
      fillInstances(trunkMesh.current, trees.map((t) => ({ x: t.x, y: 0.3 * t.s, z: t.z, sx: t.s, sy: t.s, sz: t.s })))
    if (crownMesh.current)
      fillInstances(crownMesh.current, trees.map((t) => ({ x: t.x, y: 1.15 * t.s, z: t.z, sx: t.s, sy: t.s, sz: t.s })))
    if (streetMesh.current) {
      const strips = [
        ...streetXs.map((x) => ({ x, y: 0.03, z: 0, sx: STREET, sy: 0.04, sz: half * 2 })),
        ...streetXs.map((z) => ({ x: 0, y: 0.03, z, sx: half * 2, sy: 0.04, sz: STREET })),
      ]
      fillInstances(streetMesh.current, strips)
    }
  }, [houses, trees, streetXs, half])

  return (
    <group>
      {/* grass slab with an earthen edge */}
      <mesh position={[0, -0.6, 0]}>
        <boxGeometry args={[half * 2, 1.2, half * 2]} />
        {['#6b4a2e', '#6b4a2e', '#7a9b57', '#4a3320', '#6b4a2e', '#6b4a2e'].map((c, i) => (
          <meshStandardMaterial key={i} attach={`material-${i}`} color={c} flatShading />
        ))}
      </mesh>

      <instancedMesh ref={streetMesh} args={[undefined, undefined, streetXs.length * 2]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#8d8576" flatShading />
      </instancedMesh>

      <instancedMesh ref={houseMesh} key={`h${houses.length}`} args={[undefined, undefined, houses.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial flatShading />
      </instancedMesh>

      <instancedMesh ref={trunkMesh} key={`t${trees.length}`} args={[undefined, undefined, trees.length]}>
        <cylinderGeometry args={[0.07, 0.1, 0.6, 5]} />
        <meshStandardMaterial color="#5b3d24" flatShading />
      </instancedMesh>
      <instancedMesh ref={crownMesh} key={`c${trees.length}`} args={[undefined, undefined, trees.length]}>
        <coneGeometry args={[0.5, 1.2, 6]} />
        <meshStandardMaterial color="#3f7a3a" flatShading />
      </instancedMesh>
    </group>
  )
}
