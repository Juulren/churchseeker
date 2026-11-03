// The rules an uploaded church scan must follow. The server enforces the same ones (FileValidator.ValidateGlb);
// checking the size here first saves the administrator a failed upload.

export const MODEL_MAX_BYTES = 1536 * 1024
export const MODEL_MAX_TRIANGLES = 80_000

/** Shrinks any .glb to fit the rules: merges and simplifies the meshes, compresses them with Draco and the textures with WebP. */
export const OPTIMIZE_COMMAND = 'npx @gltf-transform/cli optimize modelo.glb modelo-ligero.glb --compress draco --texture-compress webp --simplify true --instance false'

/** A message when the file cannot be accepted, or null when it can go to the server. */
export function modelProblem(file: { name: string; size: number }): string | null {
  if (!/\.glb$/i.test(file.name)) return 'El modelo debe ser un archivo .glb.'
  if (file.size > MODEL_MAX_BYTES) return `El modelo pesa ${(file.size / 1048576).toFixed(1)} MB y el máximo es ${(MODEL_MAX_BYTES / 1048576).toFixed(1)} MB. Aligéralo con la guía de abajo.`
  return null
}
