import { useEffect, useMemo, useState } from 'react'

import { getHealth } from './api'
import { AgentsPage } from './pages/AgentsPage'
import { OverviewPage } from './pages/OverviewPage'

type AppView = 'overview' | 'agents'

const NAV_ITEMS: Array<{ id: AppView; label: string; href: string }> = [
  { id: 'overview', label: 'Overview', href: '#/overview' },
  { id: 'agents', label: 'Agents', href: '#/agents' },
]

export function App() {
  const [view, setView] = useState<AppView>(() => readViewFromHash(window.location.hash))
  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null)

  useEffect(() => {
    const onHashChange = () => {
      setView(readViewFromHash(window.location.hash))
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
    switch (view) {
      case 'agents':
        return <AgentsPage />
      case 'overview':
      default:
        return <OverviewPage />
    }
  }, [view])

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
              className={item.id === view ? 'app-nav__link app-nav__link--active' : 'app-nav__link'}
              href={item.href}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <main className="app-main">{content}</main>
      </div>
    </div>
  )
}

function readViewFromHash(hash: string): AppView {
  return hash === '#/agents' ? 'agents' : 'overview'
}
