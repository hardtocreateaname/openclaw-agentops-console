import { AgentStatus, type ActionResult, type AgentUnit, type NormalizedEvent } from '../shared/types'

export type HealthSignalKind = 'stuck' | 'high_latency' | 'fallback_active' | 'uncontrollable'
export type HealthSeverity = 'info' | 'warning'
export type HealthStatus = 'healthy' | 'informational' | 'anomaly'

export interface HealthSignal {
  kind: HealthSignalKind
  severity: HealthSeverity
  anomalous: boolean
  message: string
}

export interface HealthEvaluation {
  status: HealthStatus
  signals: HealthSignal[]
}

export interface AgentResource {
  agent: AgentUnit
  unitType: string
  controllable: boolean
  lastProgressAt: string | null
  latencyMs: number | null
  fallbackActive: boolean
  health: HealthEvaluation
}

interface DataEnvelope<T> {
  data: T
}

interface HealthEnvelope {
  ok: boolean
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    throw new Error(`Request failed for ${path}: ${response.status}`)
  }

  return (await response.json()) as T
}

export function getHealth(): Promise<HealthEnvelope> {
  return requestJson<HealthEnvelope>('/api/health')
}

export async function listAgents(): Promise<AgentResource[]> {
  const response = await requestJson<DataEnvelope<AgentResource[]>>('/api/agents')
  return response.data
}

export async function getAgent(agentId: string): Promise<AgentResource> {
  const response = await requestJson<DataEnvelope<AgentResource>>(`/api/agents/${agentId}`)
  return response.data
}

export async function listEvents(limit?: number): Promise<NormalizedEvent[]> {
  const search = typeof limit === 'number' ? `?limit=${limit}` : ''
  const response = await requestJson<DataEnvelope<NormalizedEvent[]>>(`/api/events${search}`)
  return response.data
}

export async function requestAgentAction(
  agentId: string,
  action: ActionResult['action'],
  message?: string,
): Promise<ActionResult> {
  const response = await requestJson<DataEnvelope<ActionResult>>(`/api/agents/${agentId}/actions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action,
      ...(message ? { message } : {}),
    }),
  })

  return response.data
}

export function isActiveAgentStatus(status: AgentStatus): boolean {
  return status === AgentStatus.Running || status === AgentStatus.Blocked
}
