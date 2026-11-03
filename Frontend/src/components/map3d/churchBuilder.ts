import * as THREE from 'three'
import { plainMaterial } from '../quality/materials.ts'
import type { ChurchStyle } from './churchStyles.ts'
import { AUTHORED, authoredScale } from './kit/registry.ts'
import type { Detail } from './kit/facadeKit.ts'
import { buildTypology, TYPOLOGY_META } from './kit/typologies.ts'

// Every church is one of two things: an authored model of a real building (kit/registry.ts), or a typology from the same
// kit (nave, rotunda, portico, courtyard) varied by the church's own seed. An uploaded scan replaces either one (see
// churchObject.ts). Models are built in metres and scaled once, so the longest side of every church is about the same.

/** Longest side, in scene units, of a church built from a typology. */
const TYPOLOGY_SIZE = 7

/** The factor that brings a typology's longest side to TYPOLOGY_SIZE. */
export const typologyScale = (style: ChurchStyle) => TYPOLOGY_SIZE / TYPOLOGY_META[style.typology].length

/** Height of the tallest point of a church built from this style, in scene units (used to place labels and the camera). */
export function churchTop(s: ChurchStyle): number {
  if (s.authored) return AUTHORED[s.authored].height * authoredScale(s.authored)
  return TYPOLOGY_META[s.typology].height * typologyScale(s)
}

/** The low plinth every church stands on, so each reads the same on the map. */
function plinth(radius: number, z = 0.4): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius + 0.2, 0.1, 40), plainMaterial('#a39f95', 0.95))
  m.position.set(0, 0.05, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** A church for the map and the stage, built at the given level of detail. Facade toward +z, base on y = 0. */
export function buildChurch(s: ChurchStyle, detail: Detail = 'high'): THREE.Group {
  const wrapper = new THREE.Group()
  if (s.authored) {
    const model = AUTHORED[s.authored].build(detail)
    model.scale.setScalar(authoredScale(s.authored))
    wrapper.add(model)
    wrapper.add(plinth(5.4))
    return wrapper
  }
  const model = buildTypology(s.typology, { towers: s.towers, dome: s.dome, columns: 4 + (s.arches % 5) }, detail)
  model.scale.setScalar(typologyScale(s))
  wrapper.add(model)
  wrapper.add(plinth(5.2))
  return wrapper
}

/** Frees the GPU memory of every mesh in an object. Shared (cached) materials and textures are kept. */
export function disposeObject(o: THREE.Object3D) {
  o.traverse((n) => {
    const m = n as THREE.Mesh
    if (m.isMesh) m.geometry.dispose()
  })
}
