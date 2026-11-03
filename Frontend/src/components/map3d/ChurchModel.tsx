import { useEffect, useState } from 'react'
import { Box3 } from 'three'
import type * as THREE from 'three'
import { disposeObject } from './churchBuilder.ts'
import { loadChurchObject } from './churchObject.ts'
import type { ChurchStyle } from './churchStyles.ts'

interface Props {
  modelUrl: string | null
  style: ChurchStyle
  /** Called with the real bounds of an uploaded scan once loaded, and with null for any other model. */
  onScan?: (box: THREE.Box3 | null) => void
}

/** A church for the close-up stage: the uploaded model if there is one, otherwise the procedural church. */
export default function ChurchModel({ modelUrl, style, onScan }: Props) {
  const [object, setObject] = useState<THREE.Object3D | null>(null)

  useEffect(() => {
    let alive = true
    let loaded: THREE.Object3D | null = null
    loadChurchObject({ modelUrl }, style).then((o) => {
      if (!alive) { disposeObject(o); return }
      loaded = o
      setObject(o)
      onScan?.(o.userData.scan ? new Box3().setFromObject(o) : null)
    })
    return () => {
      alive = false
      if (loaded) disposeObject(loaded)
      setObject(null)
    }
    // onScan is a state setter: it never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelUrl, style])

  return object ? <primitive object={object} /> : null
}
