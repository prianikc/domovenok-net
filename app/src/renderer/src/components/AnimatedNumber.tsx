// Число, плавно перетекающее к новому значению (~300 мс).
import { useEffect, useRef, useState } from 'react'

export function AnimatedNumber({ value }: { value: number }): React.JSX.Element {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = performance.now()
    const a = from.current
    let raf = 0
    const tick = (t: number): void => {
      const k = Math.min(1, (t - start) / 300)
      const v = a + (value - a) * (1 - (1 - k) ** 3)
      setShown(v)
      from.current = v
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <>{shown.toFixed(1)}</>
}
