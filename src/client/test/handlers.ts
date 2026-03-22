import { http, HttpResponse } from 'msw'

import { ActionStatus, AgentStatus, EventKind, ModelProvider, type NormalizedEvent } from '../../shared/types'
import type { AgentResource } from '../api'

export const agentFixtures: AgentResource[] = [
  {
    agent: {
      id: 'subagents:subagent-001',
      connectorId: 'subagents',
      sessionId: 'sessions:sess-001',
      name: 'planner',
      model: 'gpt-5.4',
      provider: ModelProvider.OpenAI,
      status: AgentStatus.Running,
      capabilities: [],
      lastSeenAt: '2026-03-22T00:00:00.000Z',
      metadata: {
        lane: 'analysis',
      },
    },
    unitType: 'subagent',
    controllable: true,
    lastProgressAt: '2026-03-21T23:59:50.000Z',
    latencyMs: 310,
    fallbackActive: false,
    health: {
      status: 'healthy',
      signals: [],
    },
  },
  {
    agent: {
      id: 'subagents:subagent-002',
      connectorId: 'subagents',
      sessionId: 'sessions:sess-002',
      name: 'writer',
      model: 'claude-3.7-sonnet',
      provider: ModelProvider.Anthropic,
      status: AgentStatus.Blocked,
      capabilities: [],
      lastSeenAt: '2026-03-22T00:00:00.000Z',
      metadata: {
        lane: 'execution',
      },
    },
    unitType: 'subagent',
    controllable: false,
    lastProgressAt: '2026-03-21T23:40:00.000Z',
    latencyMs: 1800,
    fallbackActive: true,
    health: {
      status: 'anomaly',
      signals: [
        {
          kind: 'high_latency',
          severity: 'warning',
          anomalous: true,
          message: 'subagents:subagent-002 is above the configured latency threshold',
        },
        {
          kind: 'fallback_active',
          severity: 'warning',
          anomalous: true,
          message: 'subagents:subagent-002 is operating in fallback mode',
        },
      ],
    },
  },
  {
    agent: {
      id: 'sessions:sess-001',
      connectorId: 'sessions',
      sessionId: null,
      name: 'incident-triage',
      model: 'fixture:unknown',
      provider: ModelProvider.Local,
      status: AgentStatus.Running,
      capabilities: [],
      lastSeenAt: '2026-03-22T00:00:00.000Z',
      metadata: {
        owner: 'ops',
      },
    },
    unitType: 'session',
    controllable: true,
    lastProgressAt: '2026-03-22T00:00:00.000Z',
    latencyMs: 120,
    fallbackActive: false,
    health: {
      status: 'healthy',
      signals: [],
    },
  },
  {
    agent: {
      id: 'acp:proc-001',
      connectorId: 'acp',
      sessionId: null,
      name: 'policy-sync',
      model: 'fixture:unknown',
      provider: ModelProvider.Local,
      status: AgentStatus.Idle,
      capabilities: [],
      lastSeenAt: '2026-03-22T00:00:00.000Z',
      metadata: {
        host: 'agentops-dev-01',
      },
    },
    unitType: 'acp_process',
    controllable: true,
    lastProgressAt: '2026-03-22T00:00:00.000Z',
    latencyMs: 40,
    fallbackActive: false,
    health: {
      status: 'informational',
      signals: [
        {
          kind: 'uncontrollable',
          severity: 'info',
          anomalous: false,
          message: 'policy-sync has a passive monitoring signal',
        },
      ],
    },
  },
]

export const eventFixtures: NormalizedEvent[] = [
  {
    id: 'event-01',
    kind: EventKind.ActionCompleted,
    connectorId: 'subagents',
    subjectId: 'subagents:subagent-001',
    sessionId: 'sessions:sess-001',
    agentId: 'subagents:subagent-001',
    occurredAt: '2026-03-22T00:00:00.000Z',
    payload: {
      action: 'interrupt',
      status: ActionStatus.Completed,
    },
  },
  {
    id: 'event-02',
    kind: EventKind.AgentRegistered,
    connectorId: 'subagents',
    subjectId: 'subagents:subagent-002',
    sessionId: 'sessions:sess-002',
    agentId: 'subagents:subagent-002',
    occurredAt: '2026-03-21T23:59:00.000Z',
    payload: {
      unitType: 'subagent',
      lifecycle: 'running',
    },
  },
]

export const handlers = [
  http.get('/api/health', () => HttpResponse.json({ ok: true })),
  http.get('/api/agents', () => HttpResponse.json({ data: agentFixtures })),
  http.get('/api/agents/:agentId', ({ params }) => {
    const agent = agentFixtures.find((resource) => resource.agent.id === params.agentId)

    if (!agent) {
      return HttpResponse.json({ error: 'agent_not_found' }, { status: 404 })
    }

    return HttpResponse.json({ data: agent })
  }),
  http.get('/api/events', ({ request }) => {
    const url = new URL(request.url)
    const limit = Number(url.searchParams.get('limit') ?? Number.NaN)
    const data = Number.isFinite(limit) ? eventFixtures.slice(0, limit) : eventFixtures

    return HttpResponse.json({ data })
  }),
]
