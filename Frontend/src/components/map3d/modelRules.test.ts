import { describe, expect, it } from 'vitest'
import { MODEL_MAX_BYTES, modelProblem, OPTIMIZE_COMMAND } from './modelRules.ts'

describe('modelProblem', () => {
  it('accepts a small .glb', () => expect(modelProblem({ name: 'iglesia.GLB', size: 1000 })).toBeNull())
  it('accepts exactly the limit', () => expect(modelProblem({ name: 'a.glb', size: MODEL_MAX_BYTES })).toBeNull())
  it('rejects other formats', () => expect(modelProblem({ name: 'a.obj', size: 10 })).toMatch(/\.glb/))
  it('rejects a file over the limit and says how big it is', () => expect(modelProblem({ name: 'a.glb', size: 5 * 1048576 })).toMatch(/5\.0 MB/))
  it('the guide compresses with Draco, which the viewer decodes', () => expect(OPTIMIZE_COMMAND).toContain('--compress draco'))
})
