import { Router } from 'express'
import { z } from 'zod'

import {
  ActionKind,
  ActionStatus,
  AgentStatus,
  ConnectorCapability,
  EventKind,
  ModelProvider,
  type ActionResult,
  type AgentUnit,
  type NormalizedEvent,
} from '../../shared/types'
import type { ConnectorUnitSnapshot } from '../connectors/types'
import { evaluateHealth } from '../services/health-evaluator'
import type { Registry } from '../services/registry'

const actionRequestSchema = z
  .object({
    action: z.nativeEnum(ActionKind),
    message: z.string().min(1).optional(),
  })
  .strict()

export interface AgentResponseResource {
  agent: AgentUnit
  unitType: string
  controllable: boolean
  lastProgressAt: string | null
  latencyMs: number | null
  fallbackActive: boolean
  health: ReturnType<typeof evaluateHealth>
}

export function createAgentsRouter(input: {
  appendEvent: (event: NormalizedEvent) => void
  now: () => string
  registry: Registry
}): Router {
  const router = Router()

  router.get('/', (_request, response) => {
    response.json({
      data: input.registry.listUnits().map((unit) => toAgentResource(unit, input.now)),
    })
  })

  router.get('/:agentId', (request, response) => {
    const unit = input.registry.getUnit(request.params.agentId)

    if (!unit) {
      response.status(404).json({
        error: 'agent_not_found',
        message: `No agent found for ${request.params.agentId}`,
      })
      return
    }

    response.json({
      data: toAgentResource(unit, input.now),
    })
  })

  router.post('/:agentId/actions', (request, response) => {
    const unit = input.registry.getUnit(request.params.agentId)

    if (!unit) {
      response.status(404).json({
        error: 'agent_not_found',
        message: `No agent found for ${request.params.agentId}`,
      })
      return
    }

    const parsed = actionRequestSchema.safeParse(request.body)

    if (!parsed.success) {
      response.status(400).json({
        error: 'invalid_request',
        details: parsed.error.flatten(),
      })
      return
    }

    const createdAt = input.now()
    const result: ActionResult = {
      id: `${unit.id}:${parsed.data.action}:${Date.parse(createdAt)}`,
      action: parsed.data.action,
      status: unit.controllable ? ActionStatus.Completed : ActionStatus.Rejected,
      targetId: unit.id,
      message:
        parsed.data.message ??
        (unit.controllable
          ? `${parsed.data.action} completed for ${unit.id}`
          : `${unit.id} is read-only from the console`),
      error: unit.controllable ? null : `${unit.id} does not support control actions`,
      createdAt,
      completedAt: input.now(),
    }

    input.appendEvent({
      id: `${result.id}:requested`,
      kind: EventKind.ActionRequested,
      connectorId: unit.connectorId,
      subjectId: unit.id,
      sessionId: getSessionId(unit),
      agentId: unit.id,
      occurredAt: createdAt,
      payload: {
        action: result.action,
      },
    })
    input.appendEvent({
      id: `${result.id}:completed`,
      kind: EventKind.ActionCompleted,
      connectorId: unit.connectorId,
      subjectId: unit.id,
      sessionId: getSessionId(unit),
      agentId: unit.id,
      occurredAt: result.completedAt ?? createdAt,
      payload: {
        action: result.action,
        status: result.status,
        error: result.error,
      },
    })

    response.status(unit.controllable ? 202 : 409).json({
      data: result,
    })
  })

  return router
}

function toAgentResource(
  unit: ConnectorUnitSnapshot,
  now: () => string,
): AgentResponseResource {
  return {
    agent: {
      id: unit.id,
      connectorId: unit.connectorId,
      sessionId: getSessionId(unit),
      name: unit.name,
      model: typeof unit.metadata.model === 'string' ? unit.metadata.model : 'fixture:unknown',
      provider: toModelProvider(unit.metadata.provider),
      status: toAgentStatus(unit),
      capabilities: toCapabilities(unit),
      lastSeenAt: unit.lastSeenAt,
      metadata: {
        ...unit.metadata,
        unitType: unit.unitType,
      },
    },
    unitType: unit.unitType,
    controllable: unit.controllable,
    lastProgressAt: unit.lastProgressAt,
    latencyMs: unit.latencyMs,
    fallbackActive: unit.fallbackActive,
    health: evaluateHealth({
      unit,
      now: now(),
      thresholds: {
        stuckAfterMs: 10 * 60 * 1000,
        highLatencyMs: 1500,
      },
    }),
  }
}

function toAgentStatus(unit: ConnectorUnitSnapshot): AgentStatus {
  if (unit.lifecycle === 'failed') {
    return AgentStatus.Blocked
  }

  if (unit.fallbackActive) {
    return AgentStatus.Blocked
  }

  if (unit.lifecycle === 'running') {
    return AgentStatus.Running
  }

  if (unit.lifecycle === 'waiting') {
    return AgentStatus.Idle
  }

  return AgentStatus.Idle
}

function toCapabilities(unit: ConnectorUnitSnapshot): ConnectorCapability[] {
  const capabilities = new Set<ConnectorCapability>([ConnectorCapability.RunRead])

  if (unit.unitType === 'session') {
    capabilities.add(ConnectorCapability.SessionRead)
  }

  if (unit.controllable) {
    capabilities.add(ConnectorCapability.RunWrite)

    if (unit.unitType === 'session') {
      capabilities.add(ConnectorCapability.SessionWrite)
    }
  }

  return [...capabilities]
}

function toModelProvider(value: unknown): ModelProvider {
  switch (value) {
    case ModelProvider.OpenAI:
    case ModelProvider.Anthropic:
    case ModelProvider.Google:
    case ModelProvider.Local:
      return value
    default:
      return ModelProvider.Local
  }
}

function getSessionId(unit: ConnectorUnitSnapshot): string | null {
  return typeof unit.metadata.sessionId === 'string' ? unit.metadata.sessionId : null
}
