import { useEffect, useMemo, useState } from 'react'

import { AgentStatus } from '../../shared/types'
import { listAgents, type AgentResource, type HealthStatus } from '../api'
import { AgentTable } from '../components/AgentTable'

type StatusFilter = 'all' | AgentStatus
type HealthFilter = 'all' | HealthStatus

export function AgentsPage() {
  const [agents, setAgents] = useState<AgentResource[]>([])
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [healthFilter, setHealthFilter] = useState<HealthFilter>('all')
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const nextAgents = await listAgents()

        if (!cancelled) {
          setAgents(nextAgents)
          setError(null)
          setLoaded(true)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load agents')
          setLoaded(true)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  const filteredAgents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return agents.filter((resource) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        [
          resource.agent.name,
          resource.agent.id,
          resource.agent.connectorId,
          resource.agent.model,
          resource.agent.provider,
          resource.unitType,
        ].some((value) => value.toLowerCase().includes(normalizedQuery))

      const matchesStatus =
        statusFilter === 'all' || resource.agent.status === statusFilter

      const matchesHealth =
        healthFilter === 'all' || resource.health.status === healthFilter

      return matchesQuery && matchesStatus && matchesHealth
    })
  }, [agents, healthFilter, query, statusFilter])

  if (error) {
    return <section className="panel error-panel">Agents failed to load: {error}</section>
  }

  return (
    <div className="page-stack">
      <section className="hero hero--compact">
        <div>
          <p className="eyebrow">Agents</p>
          <h1>Unit inventory</h1>
          <p className="hero-copy">
            Search and narrow the fleet by runtime status and health posture.
          </p>
        </div>
        <div className="hero-summary">
          <span className="hero-summary__label">Visible units</span>
          <strong>{filteredAgents.length}</strong>
          <span className="hero-summary__meta">{agents.length} total loaded</span>
        </div>
      </section>

      <section className="panel">
        <div className="toolbar">
          <label className="field">
            <span>Search</span>
            <input
              aria-label="Search agents"
              placeholder="Search name, id, connector, model"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <label className="field">
            <span>Status</span>
            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            >
              <option value="all">All statuses</option>
              <option value={AgentStatus.Running}>Running</option>
              <option value={AgentStatus.Idle}>Idle</option>
              <option value={AgentStatus.Blocked}>Blocked</option>
              <option value={AgentStatus.Offline}>Offline</option>
            </select>
          </label>

          <label className="field">
            <span>Health</span>
            <select
              aria-label="Filter by health"
              value={healthFilter}
              onChange={(event) => setHealthFilter(event.target.value as HealthFilter)}
            >
              <option value="all">All health states</option>
              <option value="healthy">Healthy</option>
              <option value="informational">Informational</option>
              <option value="anomaly">Anomaly</option>
            </select>
          </label>
        </div>

        {!loaded ? <div className="loading-panel">Loading agents...</div> : <AgentTable agents={filteredAgents} />}
      </section>
    </div>
  )
}
