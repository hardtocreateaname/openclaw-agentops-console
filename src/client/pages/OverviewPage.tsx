import { useEffect, useState } from 'react'

import { isActiveAgentStatus, listAgents, listEvents, type AgentResource } from '../api'
import { EventFeed } from '../components/EventFeed'
import { StatusBadge } from '../components/StatusBadge'

interface OverviewState {
  agents: AgentResource[]
  events: Awaited<ReturnType<typeof listEvents>>
}

export function OverviewPage() {
  const [state, setState] = useState<OverviewState | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [agents, events] = await Promise.all([listAgents(), listEvents(8)])

        if (!cancelled) {
          setState({ agents, events })
          setError(null)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load overview')
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return <section className="panel error-panel">Overview failed to load: {error}</section>
  }

  if (!state) {
    return <section className="panel loading-panel">Loading overview...</section>
  }

  const activeAgents = state.agents.filter((resource) => isActiveAgentStatus(resource.agent.status))
  const anomalyAgents = state.agents.filter((resource) => resource.health.status === 'anomaly')
  const informationalAgents = state.agents.filter((resource) => resource.health.status === 'informational')
  const controllableAgents = state.agents.filter((resource) => resource.controllable)

  return (
    <div className="page-stack">
      <section className="hero">
        <div>
          <p className="eyebrow">Overview</p>
          <h1>Operational posture at a glance</h1>
          <p className="hero-copy">
            Track active units, recent runtime motion, and the agents that need operator attention.
          </p>
        </div>
        <div className="hero-summary">
          <span className="hero-summary__label">High-risk units</span>
          <strong>{anomalyAgents.length}</strong>
          <span className="hero-summary__meta">
            {informationalAgents.length} informational signals across the fleet
          </span>
        </div>
      </section>

      <section className="metric-grid" aria-label="Summary metrics">
        <MetricCard label="Total units" value={String(state.agents.length)} />
        <MetricCard label="Active now" value={String(activeAgents.length)} />
        <MetricCard label="Controllable" value={String(controllableAgents.length)} />
        <MetricCard label="Recent events" value={String(state.events.length)} />
      </section>

      <section className="content-grid">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Requires attention</p>
              <h2>High-risk agents</h2>
            </div>
          </div>
          {anomalyAgents.length === 0 ? (
            <div className="empty-state">
              <h3>No anomaly agents</h3>
              <p>Current connector data does not show any anomalous runtime conditions.</p>
            </div>
          ) : (
            <ul className="risk-list">
              {anomalyAgents.map((resource) => (
                <li className="risk-card" key={resource.agent.id}>
                  <div className="risk-card__header">
                    <div>
                      <h3>{resource.agent.name}</h3>
                      <p>{resource.agent.id}</p>
                    </div>
                    <StatusBadge label={resource.health.status} tone={resource.health.status} />
                  </div>
                  <p className="risk-card__summary">
                    {resource.health.signals.map((signal) => signal.message).join(' ')}
                  </p>
                  <dl className="risk-card__facts">
                    <div>
                      <dt>Runtime</dt>
                      <dd>{resource.unitType}</dd>
                    </div>
                    <div>
                      <dt>Model</dt>
                      <dd>{resource.agent.model}</dd>
                    </div>
                    <div>
                      <dt>Actions</dt>
                      <dd>{resource.controllable ? 'Operator actions enabled' : 'Read-only'}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Runtime feed</p>
              <h2>Latest events</h2>
            </div>
          </div>
          <EventFeed events={state.events} />
        </div>
      </section>
    </div>
  )
}

function MetricCard(props: { label: string; value: string }) {
  return (
    <article className="metric-card">
      <p>{props.label}</p>
      <strong>{props.value}</strong>
    </article>
  )
}
