/** True when the bytes start like a PDF. The server already checks this; the viewer refuses anything else too. */
export function looksLikePdf(data: ArrayBuffer | Uint8Array): boolean {
  const b = data instanceof Uint8Array ? data : new Uint8Array(data)
  return b.length > 8 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d
}

export const clampPage = (page: number, total: number): number =>
  total < 1 || !Number.isFinite(page) ? 1 : Math.min(total, Math.max(1, Math.trunc(page)))

export const MAX_PDF_BYTES = 30 * 1024 * 1024
