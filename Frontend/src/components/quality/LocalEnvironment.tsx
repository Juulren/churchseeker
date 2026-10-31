import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import type * as THREE from 'three'
import { makeEnvironment } from './materials.ts'

/** Soft studio reflections for every PBR material in the scene, generated locally from the renderer. */
export default function LocalEnvironment({ intensity = 0.9 }: { intensity?: number }) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    let alive = true
    let texture: THREE.Texture | null = null
    makeEnvironment(gl).then((t) => {
      if (!alive) { t.dispose(); return }
      texture = t
      scene.environment = t
      scene.environmentIntensity = intensity
    })
    return () => { alive = false; scene.environment = null; texture?.dispose() }
  }, [gl, scene, intensity])
  return null
}
