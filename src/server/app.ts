import express from 'express'

import { EventKind, type ModelPolicy, type NormalizedEvent } from '../shared/types'
import { DEFAULT_MODEL_POLICY, DEFAULT_POLICY_LAYERS, loadServerConfig } from './config'
import { createOpenClawAcpFixtureConnector } from './connectors/fixture/openclaw-acp-fixture'
import { createOpenClawSessionsFixtureConnector } from './connectors/fixture/openclaw-sessions-fixture'
import { createOpenClawSubagentsFixtureConnector } from './connectors/fixture/openclaw-subagents-fixture'
import type { ConnectorAdapter } from './connectors/types'
import { createAgentsRouter } from './routes/agents'
import { createEventsRouter } from './routes/events'
import { createPoliciesRouter } from './routes/policies'
import { Registry } from './services/registry'
import { createPolicyStore, type PolicyStore } from './store/policy-store'

export interface CreateAppOptions {
  connectors?: ConnectorAdapter[]
  defaultPolicy?: ModelPolicy
  now?: () => string
  policyStore?: PolicyStore
}

export async function createApp(options: CreateAppOptions = {}): Promise<express.Express> {
  const config = loadServerConfig()
  const now = options.now ?? (() => new Date().toISOString())
  const registry = new Registry()
  const connectors =
    options.connectors ??
    [
      createOpenClawSessionsFixtureConnector(),
      createOpenClawSubagentsFixtureConnector(),
      createOpenClawAcpFixtureConnector(),
    ]
  const policyStore =
    options.policyStore ??
    createPolicyStore({
      mode: 'file',
      filePath: config.policyStorePath,
      seedPolicies: DEFAULT_POLICY_LAYERS,
    })
  const defaultPolicy = options.defaultPolicy ?? DEFAULT_MODEL_POLICY
  const eventFeed: NormalizedEvent[] = []

  for (const connector of connectors) {
    registry.registerConnector(connector)

    const units = await connector.listUnits()
    const records = registry.upsertUnits(units)

    for (const unit of records) {
      eventFeed.push({
        id: `${unit.id}:registered`,
        kind: EventKind.AgentRegistered,
        connectorId: unit.connectorId,
        subjectId: unit.id,
        sessionId: typeof unit.metadata.sessionId === 'string' ? unit.metadata.sessionId : null,
        agentId: unit.id,
        occurredAt: unit.lastSeenAt,
        payload: {
          unitType: unit.unitType,
          lifecycle: unit.lifecycle,
        },
      })
    }

    connector.subscribe?.((event) => {
      appendEvent(eventFeed, event)
    })
  }

  eventFeed.sort(sortEventsDescending)

  const app = express()
  app.use(express.json())

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true })
  })

  app.use(
    '/api/policies',
    createPoliciesRouter({
      defaultPolicy,
      now,
      policyStore,
      registry,
    }),
  )
  app.use(
    '/api/agents',
    createAgentsRouter({
      appendEvent: (event) => appendEvent(eventFeed, event),
      now,
      registry,
    }),
  )
  app.use(
    '/api/events',
    createEventsRouter({
      listEvents: () => [...eventFeed],
    }),
  )

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    response.status(500).json({
      error: 'internal_error',
      message: error instanceof Error ? error.message : 'Unexpected server error',
    })
  })

  return app
}

function appendEvent(eventFeed: NormalizedEvent[], event: NormalizedEvent): void {
  eventFeed.unshift(event)
  eventFeed.sort(sortEventsDescending)
}

function sortEventsDescending(left: NormalizedEvent, right: NormalizedEvent): number {
  return Date.parse(right.occurredAt) - Date.parse(left.occurredAt)
}
