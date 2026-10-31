import { useEffect, useRef, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import gsap from 'gsap'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { Pose } from './projection.ts'

interface Props {
  pose: Pose
  controls: RefObject<OrbitControlsImpl | null>
  seconds?: number
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/**
 * Cinematic camera moves. Every new pose starts from wherever the camera is right now, and the previous
 * tween is killed first, so clicking quickly between churches can never queue up or jump.
 */
export default function CameraRig({ pose, controls, seconds = 1.5 }: Props) {
  const camera = useThree((s) => s.camera)
  const invalidate = useThree((s) => s.invalidate)
  const tween = useRef<gsap.core.Tween | null>(null)
  const key = pose.position.join(',') + '|' + pose.lookAt.join(',')

  useEffect(() => {
    const c = controls.current
    if (!c) return
    const from = { p: camera.position.toArray(), t: c.target.toArray() }
    const state = { k: 0 }
    tween.current?.kill()
    c.enabled = false
    tween.current = gsap.to(state, {
      k: 1,
      duration: reducedMotion() ? 0.01 : seconds,
      ease: 'power3.inOut',
      onUpdate: () => {
        camera.position.set(lerp(from.p[0], pose.position[0], state.k), lerp(from.p[1], pose.position[1], state.k), lerp(from.p[2], pose.position[2], state.k))
        c.target.set(lerp(from.t[0], pose.lookAt[0], state.k), lerp(from.t[1], pose.lookAt[1], state.k), lerp(from.t[2], pose.lookAt[2], state.k))
        c.update()
        invalidate()
      },
      onComplete: () => { c.enabled = true },
    })
    return () => {
      tween.current?.kill()
      c.enabled = true
    }
    // `key` stands for the pose values; the pose object itself is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, camera, controls, seconds, invalidate])

  return null
}
