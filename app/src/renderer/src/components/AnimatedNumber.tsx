// Число, плавно перетекающее к новому значению. Новые данные приходят раз в секунду,
// поэтому переход длится почти всю секунду — цифра всё время в движении, без рывков.
import { useEffect, useRef, useState } from 'react'

export function AnimatedNumber({ value, ms = 950 }: { value: number; ms?: number }): React.JSX.Element {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = performance.now()
    const a = from.current
    let raf = 0
    const tick = (t: number): void => {
      const k = Math.min(1, (t - start) / ms)
      const v = a + (value - a) * (1 - (1 - k) ** 2)
      setShown(v)
      from.current = v
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, ms])
  return <>{shown.toFixed(1)}</>
}
