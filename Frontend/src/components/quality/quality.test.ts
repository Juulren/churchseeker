import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { buildBook, disposeBook } from '../bookshelf/bookModel.ts'
import { buildChurch, churchTop, disposeObject } from '../map3d/churchBuilder.ts'
import { styleFor } from '../map3d/churchStyles.ts'
import { fitTitle, leather, spine } from './proceduralTextures.ts'

const measure = (t: string, px: number) => t.length * px * 0.55
const meshes = (o: THREE.Object3D) => { let n = 0; o.traverse((c) => { if ((c as THREE.Mesh).isMesh) n++ }); return n }

describe('fitTitle', () => {
  it('keeps a short title at full size', () => {
    expect(fitTitle(measure, 'Misal', 400, 60)).toEqual({ text: 'Misal', px: 60 })
  })

  it('shrinks, then trims with an ellipsis, never exceeding the room', () => {
    const r = fitTitle(measure, 'Libro de bautismos de la parroquia de San Ildefonso 1750', 300, 62)
    expect(r.px).toBeLessThanOrEqual(62)
    expect(r.px).toBeGreaterThanOrEqual(18)
    expect(r.text.endsWith('…')).toBe(true)
    expect(measure(r.text.replace('…', ''), r.px)).toBeLessThanOrEqual(300)
  })

  it('handles empty, whitespace and hostile titles', () => {
    expect(fitTitle(measure, '', 300, 60).text).toBe('—')
    expect(fitTitle(measure, '   \n\t ', 300, 60).text).toBe('—')
    expect(fitTitle(measure, undefined as unknown as string, 300, 60).text).toBe('—')
    expect(fitTitle(measure, '<img src=x onerror=alert(1)>', 100, 60).text.length).toBeGreaterThan(0)
    expect(fitTitle(measure, 'x'.repeat(10_000), 100, 60).text.length).toBeLessThan(200)
  })
})

describe('textures without a DOM', () => {
  it('return null instead of throwing (unit tests, server rendering)', () => {
    expect(leather('#663300')).toBeNull()
    expect(spine({ title: 'x', color: '#663300', width: 0.5, height: 1.8 })).toBeNull()
  })
})

describe('buildBook', () => {
  const spec = { w: 0.7, h: 1.8, d: 1.2, color: '#6b3f2a', title: 'Libro de bautismos', author: 'Archivo', isPublic: true }

  it('builds boards, pages, a rounded spine, bands and a ribbon', () => {
    const b = buildBook(spec)
    expect(meshes(b)).toBeGreaterThanOrEqual(10)
    const box = new THREE.Box3().setFromObject(b)
    const size = box.getSize(new THREE.Vector3())
    expect(size.x).toBeGreaterThan(spec.w * 0.95)
    expect(size.x).toBeLessThan(spec.w * 1.2)
    expect(size.y).toBeGreaterThan(spec.h)
    expect(size.y).toBeLessThan(spec.h + 0.7)
    expect(Number.isFinite(size.z) && size.z >= spec.d).toBe(true)
  })

  it('adds a brass lock only to private books', () => {
    expect(meshes(buildBook({ ...spec, isPublic: false }))).toBe(meshes(buildBook(spec)) + 3)
  })

  it('survives extreme thickness and odd titles, and can be disposed', () => {
    for (const w of [0.3, 1.1]) for (const title of ['', '<b>x</b>', 'ñ'.repeat(500)]) {
      const b = buildBook({ ...spec, w, title })
      expect(Number.isFinite(new THREE.Box3().setFromObject(b).getSize(new THREE.Vector3()).x)).toBe(true)
      expect(() => disposeBook(b)).not.toThrow()
    }
  })
})

describe('buildChurch', () => {
  const ids = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 'new-church']

  it('builds a detailed church for every style, inside sane bounds', () => {
    for (const id of ids) {
      const style = styleFor({ id })
      const c = buildChurch(style)
      expect(meshes(c)).toBeGreaterThan(40)
      const box = new THREE.Box3().setFromObject(c)
      const size = box.getSize(new THREE.Vector3())
      expect(box.min.y).toBeGreaterThanOrEqual(-0.01)
      expect(size.y).toBeGreaterThan(style.height)
      expect(size.y).toBeLessThanOrEqual(churchTop(style) + 2)
      expect(size.x).toBeLessThan(style.width + 8) // forecourt, buttresses and portico widen the footprint
      expect(Number.isFinite(size.x + size.y + size.z)).toBe(true)
      expect(() => disposeObject(c)).not.toThrow()
    }
  })

  it('gives towers, domes and porticoes only where the style asks for them', () => {
    const plain = { ...styleFor({ id: 'x' }), towers: 0 as const, dome: false, arches: 0 }
    const rich = { ...plain, towers: 2 as const, dome: true, arches: 5 }
    expect(meshes(buildChurch(rich))).toBeGreaterThan(meshes(buildChurch(plain)) + 40)
  })
})
