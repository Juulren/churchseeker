import * as THREE from 'three'
import { MercatorCoordinate, type CustomLayerInterface, type CustomRenderMethodInput, type Map as MapLibreMap } from 'maplibre-gl'
import { disposeObject } from './churchBuilder.ts'
import { makeEnvironment } from '../quality/materials.ts'
import { loadChurchObject } from './churchObject.ts'
import { styleFor } from './churchStyles.ts'
import type { PublicChurch } from '../../services/types.ts'

// A model unit is this many real metres: churches are drawn a little larger than life so they read on the map.
export const METERS_PER_UNIT = 8

interface Item {
  church: PublicChurch
  scene: THREE.Scene
  holder: THREE.Group
  mercator: MercatorCoordinate
  /** Current and target highlight scale (1 = normal). */
  scale: number
  target: number
  object: THREE.Object3D | null
}

/** MapLibre custom layer that draws every church as a 3D object standing on its real coordinates. */
export class ChurchLayer implements CustomLayerInterface {
  readonly id = 'churches-3d'
  readonly type = 'custom' as const
  readonly renderingMode = '3d' as const

  private map: MapLibreMap | null = null
  private renderer: THREE.WebGLRenderer | null = null
  private readonly camera = new THREE.Camera()
  private items: Item[] = []
  private generation = 0
  private last = 0
  private environment: THREE.Texture | null = null
  private sizeW = 0
  private sizeH = 0
  private readonly rotationX = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2)

  onAdd(map: MapLibreMap, gl: WebGL2RenderingContext) {
    this.map = map
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true })
    this.renderer.autoClear = false
    const renderer = this.renderer
    makeEnvironment(renderer).then((t) => {
      this.environment = t
      for (const it of this.items) it.scene.environment = t
      this.map?.triggerRepaint()
    })
  }

  onRemove() {
    this.clear()
    this.environment?.dispose()
    this.renderer?.dispose()
    this.renderer = null
    this.map = null
  }

  private clear() {
    this.generation++
    for (const it of this.items) { if (it.object) disposeObject(it.object) }
    this.items = []
  }

  /** Replaces the set of churches on the map. Models load in the background; the layer draws what is ready. */
  setChurches(churches: PublicChurch[]) {
    this.clear()
    const generation = this.generation
    for (const church of churches) {
      const scene = new THREE.Scene()
      scene.environment = this.environment
      scene.environmentIntensity = 0.9
      scene.add(new THREE.HemisphereLight('#fff1d0', '#6a5a48', 0.7))
      const sun = new THREE.DirectionalLight('#ffe4b0', 1.8)
      sun.position.set(-30, 60, 40)
      scene.add(sun)
      const holder = new THREE.Group()
      scene.add(holder)
      const item: Item = {
        church, scene, holder, scale: 1, target: 1, object: null,
        mercator: MercatorCoordinate.fromLngLat([church.longitude, church.latitude], 0),
      }
      this.items.push(item)
      loadChurchObject(church, styleFor(church)).then((object) => {
        // A newer set of churches may have replaced this one while the model was loading.
        if (generation !== this.generation) { disposeObject(object); return }
        item.object = object
        holder.add(object)
        this.map?.triggerRepaint()
      })
    }
  }

  setHighlight(hoveredId: string | null, selectedId: string | null) {
    for (const it of this.items) it.target = it.church.id === hoveredId || it.church.id === selectedId ? 1.12 : 1
    this.map?.triggerRepaint()
  }

  render(_gl: WebGL2RenderingContext, options: CustomRenderMethodInput) {
    const { renderer, map } = this
    if (!renderer || !map) return
    const now = performance.now()
    const dt = Math.min((now - this.last) / 1000, 0.1)
    this.last = now
    // mainMatrix maps spherical-mercator coordinates (0..1 over the world) to clip space.
    const projection = new THREE.Matrix4().fromArray(options.defaultProjectionData.mainMatrix as unknown as number[])
    let animating = false
    // The map canvas changes size (window resize, layout); three.js only knows the size it had when it was created.
    const canvas = map.getCanvas()
    if (canvas.width !== this.sizeW || canvas.height !== this.sizeH) {
      this.sizeW = canvas.width
      this.sizeH = canvas.height
      renderer.setPixelRatio(1)
      renderer.setSize(canvas.width, canvas.height, false)
    }
    renderer.resetState()
    for (const it of this.items) {
      if (!it.object) continue
      it.scale = THREE.MathUtils.damp(it.scale, it.target, 8, dt)
      if (Math.abs(it.scale - it.target) > 0.002) animating = true
      const s = it.mercator.meterInMercatorCoordinateUnits() * METERS_PER_UNIT
      it.holder.scale.setScalar(it.scale)
      const model = new THREE.Matrix4()
        .makeTranslation(it.mercator.x, it.mercator.y, it.mercator.z)
        .scale(new THREE.Vector3(s, -s, s))
        .multiply(this.rotationX)
      this.camera.projectionMatrix = projection.clone().multiply(model)
      renderer.render(it.scene, this.camera)
    }
    if (animating) map.triggerRepaint()
  }
}
