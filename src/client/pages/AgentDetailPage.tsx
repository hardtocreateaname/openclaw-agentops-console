import { useEffect, useMemo, useState } from 'react'

import { EventKind, type JsonValue } from '../../shared/types'
import { getAgent, listEvents, type AgentResource } from '../api'
import { PolicyResolutionCard, type PolicyResolutionResult } from '../components/PolicyResolutionCard'
import { StatusBadge } from '../components/StatusBadge'

interface DetailState {
  agent: AgentResource
  events: Awaited<ReturnType<typeof listEvents>>
  resolution: PolicyResolutionResult
}

export function AgentDetailPage(props: { agentId: string }) {
  const [state, setState] = useState<DetailState | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [agent, events, resolution] = await Promise.all([
          getAgent(props.agentId),
          listEvents(12),
          resolvePolicy(props.agentId),
        ])

        if (!cancelled) {
          setState({
            agent,
            events,
            resolution,
          })
          setError(null)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load agent detail')
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [props.agentId])

  const relevantEvents = useMemo(() => {
    if (!state) {
      return []
    }

    return state.events.filter(
      (event) => event.agentId === props.agentId || event.subjectId === props.agentId,
    )
  }, [props.agentId, state])

  if (error) {
    return <section className="panel error-panel">Agent detail failed to load: {error}</section>
  }

  if (!state) {
    return <section className="panel loading-panel">Loading agent detail...</section>
  }

  const anomalies = state.agent.health.signals.filter((signal) => signal.anomalous)
  const supportedActions = getSupportedActions(state.agent)
  const fallbackSignals = state.agent.health.signals.filter((signal) => signal.kind === 'fallback_active')
  const configuredFallbackPolicy = describeConfiguredFallback(state.resolution)
  const observedFallbackReason =
    fallbackSignals.map((signal) => signal.message).join(' ') ||
    (state.agent.fallbackActive
      ? 'Fallback mode is active without a detailed signal from the connector.'
      : 'No fallback activity is currently observed.')

  return (
    <div className="page-stack">
      <section className="hero hero--compact">
        <div>
          <p className="eyebrow">Agent detail</p>
          <h1>{state.agent.agent.name}</h1>
          <p className="hero-copy">
            {state.agent.agent.id} on {state.agent.agent.provider} / {state.agent.agent.model}
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
            <StatusBadge label={state.agent.agent.status} tone={state.agent.agent.status} />
            <StatusBadge label={state.agent.health.status} tone={state.agent.health.status} />
          </div>
        </div>
        <div className="hero-summary">
          <span className="hero-summary__label">Runtime posture</span>
          <strong>{state.agent.unitType}</strong>
          <span className="hero-summary__meta">
            {state.agent.controllable ? 'Control actions available' : 'Read-only monitoring'}
          </span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Navigation</p>
            <h2>Context</h2>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <a className="action-pill" href="#/agents">
            Back to agents
          </a>
          <a className="action-pill" href="#/policies">
            Open policies
          </a>
        </div>
      </section>

      <section
        style={{
          display: 'grid',
          gap: '20px',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        }}
      >
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Recent output</p>
              <h2>Latest runtime events</h2>
            </div>
          </div>
          {relevantEvents.length === 0 ? (
            <div className="empty-state">
              <h3>No recent output</h3>
              <p>No event feed entries are attached to this unit yet.</p>
            </div>
          ) : (
            <ul className="event-feed">
              {relevantEvents.slice(0, 4).map((event) => (
                <li className="event-card" key={event.id}>
                  <div className="event-card__header">
                    <span className="event-card__title">{summarizeEvent(event.kind)}</span>
                    <span className="event-kind event-kind--info">{formatTimestamp(event.occurredAt)}</span>
                  </div>
                  <p className="event-card__detail">{describeEventPayload(event.payload)}</p>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Anomalies</p>
              <h2>Observed runtime signals</h2>
            </div>
          </div>
          {anomalies.length === 0 ? (
            <div className="empty-state">
              <h3>No active anomalies</h3>
              <p>The current health evaluation does not flag anomalous signals.</p>
            </div>
          ) : (
            <ul className="risk-list">
              {anomalies.map((signal) => (
                <li className="risk-card" key={`${signal.kind}:${signal.message}`}>
                  <div className="risk-card__header">
                    <h3 style={{ margin: 0 }}>{signal.kind.replace(/_/g, ' ')}</h3>
                    <span className="event-kind event-kind--warning">{signal.severity}</span>
                  </div>
                  <p className="risk-card__summary">{signal.message}</p>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <section
        style={{
          display: 'grid',
          gap: '20px',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        }}
      >
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Supported actions</p>
              <h2>Console controls</h2>
            </div>
          </div>
          <div className="action-pills" aria-label="Supported actions">
            {supportedActions.map((action) => (
              <span className="action-pill" key={action}>
                {action}
              </span>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Fallback posture</p>
              <h2>Configured vs observed</h2>
            </div>
          </div>
          <dl className="risk-card__facts" style={{ gridTemplateColumns: '1fr' }}>
            <div>
              <dt>Configured fallback policy</dt>
              <dd>{configuredFallbackPolicy}</dd>
            </div>
            <div>
              <dt>Observed fallback reason</dt>
              <dd>{observedFallbackReason}</dd>
            </div>
          </dl>
        </article>
      </section>

      <PolicyResolutionCard resolution={state.resolution} />
    </div>
  )
}

async function resolvePolicy(agentId: string): Promise<PolicyResolutionResult> {
  const response = await fetch('/api/policies/resolve', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ targetId: agentId }),
  })

  if (!response.ok) {
    throw new Error(`Request failed for /api/policies/resolve: ${response.status}`)
  }

  const data = (await response.json()) as { data: PolicyResolutionResult }
  return data.data
}

function getSupportedActions(agent: AgentResource): string[] {
  if (!agent.controllable) {
    return ['Read-only runtime', 'Escalate via policy override']
  }

  return ['Interrupt', 'Resume', 'Terminate', 'Approve', 'Reject']
}

function describeConfiguredFallback(resolution: PolicyResolutionResult): string {
  const escalation = resolution.resolvedPolicy.overrides.escalation
  const reviewLane = resolution.resolvedPolicy.overrides.reviewLane
  const qualifiers = Object.entries(resolution.explanation.appliesTo.metadata)

  const parts = []

  if (typeof escalation === 'string') {
    parts.push(`Escalate to ${escalation}`)
  }

  if (typeof reviewLane === 'string') {
    parts.push(`route review through ${reviewLane}`)
  }

  if (qualifiers.length > 0) {
    parts.push(`apply when ${qualifiers.map(([key, value]) => `${key}=${formatJsonValue(value)}`).join(', ')}`)
  }

  return parts.join('; ') || 'Use the global console default with no extra fallback override.'
}

function summarizeEvent(kind: EventKind): string {
  switch (kind) {
    case EventKind.ActionCompleted:
      return 'Action completed'
    case EventKind.ActionRequested:
      return 'Action requested'
    case EventKind.AgentRegistered:
      return 'Agent registered'
    case EventKind.AgentUpdated:
      return 'Agent updated'
    case EventKind.SessionStarted:
      return 'Session started'
    case EventKind.SessionUpdated:
      return 'Session updated'
    default:
      return kind
  }
}

function describeEventPayload(payload: Record<string, JsonValue>): string {
  const entries = Object.entries(payload)

  if (entries.length === 0) {
    return 'No payload details were recorded.'
  }

  return entries.map(([key, value]) => `${key}: ${formatJsonValue(value)}`).join(' | ')
}

function formatJsonValue(value: JsonValue): string {
  if (Array.isArray(value)) {
    return value.map(formatJsonValue).join(', ')
  }

  if (value && typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
