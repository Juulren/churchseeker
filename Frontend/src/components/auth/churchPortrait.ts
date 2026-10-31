import * as THREE from 'three'
import { buildChurch, disposeObject } from '../map3d/churchBuilder.ts'
import { styleFor } from '../map3d/churchStyles.ts'
import { hasWebGL } from '../map3d/webgl.ts'
import { makeEnvironment } from '../quality/materials.ts'

export interface LiveChurch {
  /** A muted, playing <video> showing the church turning: the source for the ASCII art. */
  video: HTMLVideoElement
  stop: () => void
}

/**
 * Renders a church slowly turning on a dark ground and exposes it as a live video stream. The ASCII engine
 * samples that video, so the characters themselves show the church rotating.
 */
export async function startLiveChurch(churchId: string, width = 540, height = 675): Promise<LiveChurch | null> {
  if (!hasWebGL()) return null
  const canvas = document.createElement('canvas')
  if (typeof canvas.captureStream !== 'function') return null
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(1)
  renderer.setSize(width, height, false)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#05080c')
  scene.environment = await makeEnvironment(renderer)
  scene.add(new THREE.HemisphereLight('#fff1d8', '#202833', 0.5))
  const sun = new THREE.DirectionalLight('#ffe9c4', 2.6)
  sun.position.set(7, 12, 9)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  scene.add(sun)
  const church = buildChurch(styleFor({ id: churchId }))
  const pivot = new THREE.Group()
  pivot.add(church)
  scene.add(pivot)
  const ground = new THREE.Mesh(new THREE.CircleGeometry(14, 48), new THREE.MeshStandardMaterial({ color: '#10161d', roughness: 1 }))
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)
  const camera = new THREE.PerspectiveCamera(32, width / height, 0.5, 100)
  camera.position.set(0, 7, 18.5)
  camera.lookAt(0, 3.4, 0)

  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  let raf = 0
  let last = performance.now()
  const loop = (now: number) => {
    pivot.rotation.y += Math.min((now - last) / 1000, 0.1) * (reduced ? 0 : 0.45)
    last = now
    renderer.render(scene, camera)
    raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)

  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.srcObject = canvas.captureStream(30)
  await video.play().catch(() => {})

  return {
    video,
    stop: () => {
      cancelAnimationFrame(raf)
      video.pause()
      ;(video.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop())
      video.srcObject = null
      disposeObject(church)
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }
}
