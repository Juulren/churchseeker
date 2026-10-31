import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { buildChurch } from './churchBuilder.ts'
import type { ChurchStyle } from './churchStyles.ts'

// Footprint (longest side) every church is scaled to, in model units. Real .glb files come in any size.
export const TARGET_SIZE = 8

export interface ChurchObjectInput { modelUrl: string | null }

const loader = new GLTFLoader()

/** True for uploaded models served by the API; the static default path in the seed is not a real file. */
export const isUploadedModel = (url: string | null): url is string => !!url && /^\/api\/public\/churches\/[0-9a-f-]{36}\/model$/i.test(url)

/** Scales a loaded model so its longest side is TARGET_SIZE, centres it on the origin and puts its base on y = 0. */
export function normalizeModel(root: THREE.Object3D): THREE.Object3D {
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const longest = Math.max(size.x, size.y, size.z)
  if (!Number.isFinite(longest) || longest <= 0) throw new Error('Empty model')
  const wrapper = new THREE.Group()
  const k = TARGET_SIZE / longest
  root.scale.multiplyScalar(k)
  const scaled = new THREE.Box3().setFromObject(root)
  const centre = scaled.getCenter(new THREE.Vector3())
  root.position.set(root.position.x - centre.x, root.position.y - scaled.min.y, root.position.z - centre.z)
  wrapper.add(root)
  return wrapper
}

/**
 * The 3D object for a church: the .glb uploaded by its administrator when there is one (a faithful model made
 * by an artist), otherwise the procedural low-poly church. Any loading problem falls back to the procedural one.
 */
export async function loadChurchObject(church: ChurchObjectInput, style: ChurchStyle): Promise<THREE.Object3D> {
  if (isUploadedModel(church.modelUrl)) {
    try {
      const gltf = await loader.loadAsync(church.modelUrl)
      return normalizeModel(gltf.scene)
    } catch {
      /* use the procedural model */
    }
  }
  return buildChurch(style)
}
