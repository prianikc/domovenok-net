export function Tile({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="tile">
      <div className="lbl">{label}</div>
      {children}
    </div>
  )
}
