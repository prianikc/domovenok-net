import type { TunnelState } from '../../../shared/types'
import { STATE_LABEL } from '../lib'

const ORDER: TunnelState[] = ['off', 'list', 'full']

export function StateSwitch({
  value,
  onChange,
  disabled
}: {
  value: TunnelState | undefined
  onChange: (s: TunnelState) => void
  disabled?: boolean
}): React.JSX.Element {
  return (
    <div className="seg">
      {ORDER.map((s) => (
        <button key={s} className={value === s ? 'on' : ''} disabled={disabled} onClick={() => onChange(s)}>
          {STATE_LABEL[s]}
        </button>
      ))}
    </div>
  )
}
