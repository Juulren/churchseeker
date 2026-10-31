import { useEffect, useState } from 'react'
import type * as THREE from 'three'
import { disposeObject } from './churchBuilder.ts'
import { loadChurchObject } from './churchObject.ts'
import type { ChurchStyle } from './churchStyles.ts'

interface Props {
  modelUrl: string | null
  style: ChurchStyle
}

/** A church for the close-up stage: the uploaded model if there is one, otherwise the procedural church. */
export default function ChurchModel({ modelUrl, style }: Props) {
  const [object, setObject] = useState<THREE.Object3D | null>(null)

  useEffect(() => {
    let alive = true
    let loaded: THREE.Object3D | null = null
    loadChurchObject({ modelUrl }, style).then((o) => {
      if (!alive) { disposeObject(o); return }
      loaded = o
      setObject(o)
    })
    return () => {
      alive = false
      if (loaded) disposeObject(loaded)
      setObject(null)
    }
  }, [modelUrl, style])

  return object ? <primitive object={object} /> : null
}
