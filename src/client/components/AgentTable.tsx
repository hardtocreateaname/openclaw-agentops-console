import { AgentStatus } from '../../shared/types'
import type { AgentResource } from '../api'
import { StatusBadge } from './StatusBadge'

export function AgentTable(props: { agents: AgentResource[] }) {
  if (props.agents.length === 0) {
    return (
      <div className="empty-state">
        <h3>No agents match the current filters.</h3>
        <p>Adjust the search or status filters to broaden the view.</p>
      </div>
    )
  }

  return (
    <div className="table-shell">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Agent</th>
            <th scope="col">Status</th>
            <th scope="col">Health</th>
            <th scope="col">Model</th>
            <th scope="col">Runtime</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {props.agents.map((resource) => {
            const primaryAction = resource.agent.status === AgentStatus.Running ? 'Interrupt' : 'Resume'

            return (
              <tr key={resource.agent.id}>
                <td>
                  <div className="cell-title">{resource.agent.name}</div>
                  <div className="cell-subtitle">{resource.agent.id}</div>
                </td>
                <td>
                  <StatusBadge
                    label={resource.agent.status}
                    tone={resource.agent.status}
                  />
                </td>
                <td>
                  <StatusBadge label={resource.health.status} tone={resource.health.status} />
                  <div className="cell-subtitle">
                    {resource.health.signals[0]?.message ?? 'No active signals'}
                  </div>
                </td>
                <td>
                  <div className="cell-title">{resource.agent.model}</div>
                  <div className="cell-subtitle">{resource.agent.provider}</div>
                </td>
                <td>
                  <div className="cell-title">
                    {resource.latencyMs === null ? 'Latency unavailable' : `${resource.latencyMs} ms`}
                  </div>
                  <div className="cell-subtitle">
                    {resource.fallbackActive
                      ? 'Fallback active'
                      : resource.lastProgressAt
                        ? `Progress ${formatTimestamp(resource.lastProgressAt)}`
                        : 'No progress timestamp'}
                  </div>
                </td>
                <td>
                  <div className="action-pills">
                    <span className="action-pill">{resource.controllable ? primaryAction : 'Read-only'}</span>
                    {resource.controllable ? <span className="action-pill">Terminate</span> : null}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString()
}
