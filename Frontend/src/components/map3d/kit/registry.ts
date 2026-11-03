import type * as THREE from 'three'
import { buildCathedral, CATHEDRAL } from './cathedral.ts'
import type { Detail } from './facadeKit.ts'
import { buildJesus, JESUS } from './jesus.ts'
import { buildSantaLucia, SANTA_LUCIA } from './santaLucia.ts'

export type AuthoredKind = 'cathedral' | 'jesus' | 'santalucia'

export interface Authored {
  build: (detail: Detail) => THREE.Group
  /** Longest side of the plan, in metres: the model is scaled so this becomes AUTHORED_SIZE scene units. */
  length: number
  /** Height of the tallest point, in metres. */
  height: number
  /** Width of the facade, in metres. */
  width: number
  /** Number of towers the real building has, so tests can hold the model to it. */
  towers: number
}

/** The scene size, in units, that the longest side of every authored church is brought to. */
export const AUTHORED_SIZE = 8.5

export const AUTHORED: Record<AuthoredKind, Authored> = {
  cathedral: { build: buildCathedral, length: CATHEDRAL.length, height: CATHEDRAL.towerHeight, width: CATHEDRAL.width, towers: 2 },
  jesus: { build: buildJesus, length: JESUS.length, height: JESUS.height, width: JESUS.width, towers: 2 },
  santalucia: { build: buildSantaLucia, length: SANTA_LUCIA.length, height: SANTA_LUCIA.height, width: SANTA_LUCIA.width, towers: 0 },
}

export const authoredScale = (kind: AuthoredKind) => AUTHORED_SIZE / AUTHORED[kind].length
