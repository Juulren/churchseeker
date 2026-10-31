import * as THREE from 'three'
import { buildChurch } from '../map3d/churchBuilder.ts'
import { styleFor } from '../map3d/churchStyles.ts'
import { hasWebGL } from '../map3d/webgl.ts'
import { makeEnvironment } from '../quality/materials.ts'

/** Renders one church once, on a dark ground, and returns a blob URL to feed the ASCII art panel. */
export async function renderChurchPortrait(churchId: string, width = 720, height = 900): Promise<string | null> {
  if (!hasWebGL()) return null
  const canvas = document.createElement('canvas')
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
  renderer.setSize(width, height, false)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  try {
    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#05080c')
    scene.environment = await makeEnvironment(renderer)
    scene.add(new THREE.HemisphereLight('#fff1d8', '#202833', 0.5))
    const sun = new THREE.DirectionalLight('#ffe9c4', 2.6)
    sun.position.set(7, 12, 9)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    scene.add(sun)
    const church = buildChurch(styleFor({ id: churchId }))
    scene.add(church)
    const ground = new THREE.Mesh(new THREE.CircleGeometry(14, 48), new THREE.MeshStandardMaterial({ color: '#10161d', roughness: 1 }))
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)
    const camera = new THREE.PerspectiveCamera(32, width / height, 0.5, 100)
    camera.position.set(9, 7, 17)
    camera.lookAt(0, 3.4, 0)
    renderer.render(scene, camera)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    return blob ? URL.createObjectURL(blob) : null
  } finally {
    renderer.dispose()
    renderer.forceContextLoss()
  }
}
