// The whole project is monochrome except the map: every colour that reaches a 3D material, a texture or a light goes
// through here and comes out as the grey of the same brightness.

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

/** The grey of equal luminance (Rec. 709 on sRGB), as a hex string. Anything that is not a hex colour comes back as mid grey. */
export function toGrey(color: string): string {
  if (!HEX.test(color)) return '#808080'
  let h = color.slice(1)
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h, 16)
  const y = Math.round(0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255))
  const g = y.toString(16).padStart(2, '0')
  return `#${g}${g}${g}`
}

/** Replaces the colour of every pixel of a canvas with its luminance. */
export function desaturate(c: HTMLCanvasElement): void {
  const g = c.getContext('2d')
  if (!g || c.width === 0 || c.height === 0) return
  const img = g.getImageData(0, 0, c.width, c.height)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
    d[i] = d[i + 1] = d[i + 2] = y
  }
  g.putImageData(img, 0, 0)
}

/** Brightness of a hex colour from 0 (black) to 255 (white). */
export const luma = (color: string): number => parseInt(toGrey(color).slice(1, 3), 16)

/** Ink that stays readable on a given background: near-black on light greys, near-white on dark ones. */
export const readableOn = (background: string): string => (luma(background) > 140 ? '#161616' : '#ececec')
