import type { AgentStatus } from '../../shared/types'
import type { HealthStatus } from '../api'

type StatusBadgeTone = AgentStatus | HealthStatus

export function StatusBadge(props: { label: string; tone: StatusBadgeTone }) {
  return (
    <span className={`status-badge status-badge--${props.tone}`}>
      {props.label}
    </span>
  )
}
