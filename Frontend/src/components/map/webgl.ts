// Each probe creates a context, and browsers allow only a handful at once: a probe that runs on every render (as one did
// while the map turned, one render per frame) lost the map its own context. The answer cannot change while the page is
// open, so a positive answer is kept. A negative one is asked again later: it can come from a moment when the GPU process
// was restarting or other contexts were still alive.
let known: true | null = null

/** True when the browser can create a WebGL context at all. */
export function hasWebGL(): boolean {
  if (known !== null) return known
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (gl) known = true
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    return false
  }
  return known === true
}
