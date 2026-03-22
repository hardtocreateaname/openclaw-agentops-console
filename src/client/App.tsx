import { useEffect, useMemo, useState } from 'react'

import { getHealth } from './api'
import { AgentDetailPage } from './pages/AgentDetailPage'
import { AgentsPage } from './pages/AgentsPage'
import { OverviewPage } from './pages/OverviewPage'
import { PoliciesPage } from './pages/PoliciesPage'

type AppView = 'overview' | 'agents' | 'agent-detail' | 'policies'
type NavView = 'overview' | 'agents' | 'policies'

interface AppRoute {
  view: AppView
  agentId?: string
}

const NAV_ITEMS: Array<{ id: NavView; label: string; href: string }> = [
  { id: 'overview', label: 'Overview', href: '#/overview' },
  { id: 'agents', label: 'Agents', href: '#/agents' },
  { id: 'policies', label: 'Policies', href: '#/policies' },
]

export function App() {
  const [route, setRoute] = useState<AppRoute>(() => readRouteFromHash(window.location.hash))
  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null)

  useEffect(() => {
    const onHashChange = () => {
      setRoute(readRouteFromHash(window.location.hash))
    }

    window.addEventListener('hashchange', onHashChange)

    if (!window.location.hash) {
      window.location.hash = NAV_ITEMS[0].href
    }

    return () => {
      window.removeEventListener('hashchange', onHashChange)
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadHealth() {
      try {
        const response = await getHealth()

        if (!cancelled) {
          setApiHealthy(response.ok)
        }
      } catch {
        if (!cancelled) {
          setApiHealthy(false)
        }
      }
    }

    void loadHealth()

    return () => {
      cancelled = true
    }
  }, [])

  const content = useMemo(() => {
    switch (route.view) {
      case 'agent-detail':
        return <AgentDetailPage agentId={route.agentId ?? ''} />
      case 'agents':
        return <AgentsPage />
      case 'policies':
        return <PoliciesPage />
      case 'overview':
      default:
        return <OverviewPage />
    }
  }, [route])

  const activeNavId: NavView = route.view === 'agent-detail' ? 'agents' : route.view

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">OpenClaw AgentOps Console</p>
          <h1 className="app-title">Console</h1>
        </div>
        <div className={`api-indicator api-indicator--${apiHealthy === false ? 'down' : 'up'}`}>
          <span className="api-indicator__dot" aria-hidden="true" />
          <span>{apiHealthy === null ? 'Checking API' : apiHealthy ? 'API healthy' : 'API unavailable'}</span>
        </div>
      </header>

      <div className="app-body">
        <nav className="app-nav" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.id}
              className={item.id === activeNavId ? 'app-nav__link app-nav__link--active' : 'app-nav__link'}
              href={item.href}
            >
              {item.label}
            </a>
          ))}
          {route.view === 'agent-detail' && route.agentId ? (
            <a className="app-nav__link app-nav__link--active" href={`#/agents/${route.agentId}`}>
              Agent Detail
            </a>
          ) : null}
        </nav>

        <main className="app-main">{content}</main>
      </div>
    </div>
  )
}

function readRouteFromHash(hash: string): AppRoute {
  const normalizedHash = hash.replace(/^#/, '')

  if (normalizedHash.startsWith('/agents/')) {
    const agentId = decodeURIComponent(normalizedHash.slice('/agents/'.length))

    return {
      view: 'agent-detail',
      agentId,
    }
  }

  if (normalizedHash === '/agents') {
    return { view: 'agents' }
  }

  if (normalizedHash === '/policies') {
    return { view: 'policies' }
  }

  return { view: 'overview' }
}
