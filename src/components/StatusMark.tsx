import { AlertTriangle, Check, CircleHelp, X } from 'lucide-react'
import type { CheckState } from '../types'

const icons = { pass: Check, caution: AlertTriangle, fail: X, unknown: CircleHelp }

export function StatusMark({ state, compact = false }: { state: CheckState; compact?: boolean }) {
  const Icon = icons[state]
  return <span className={`status-mark status-${state} ${compact ? 'status-compact' : ''}`} aria-label={state}><Icon aria-hidden="true" size={compact ? 12 : 16} strokeWidth={2} />{compact ? null : <span>{state}</span>}</span>
}
