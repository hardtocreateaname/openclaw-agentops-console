import { Router } from 'express'
import { z } from 'zod'

import {
  PolicyScope,
  PolicySource,
  type JsonValue,
  type ModelPolicy,
  type ResolvedPolicy,
} from '../../shared/types'
import { parseConnectorQualifiedId } from '../connectors/types'
import { resolvePolicy, type PolicyLayer } from '../services/policy-engine'
import type { Registry } from '../services/registry'
import type { PolicyStore } from '../store/policy-store'

const resolvePolicyRequestSchema = z
  .object({
    targetId: z.string().min(1),
    unitType: z.string().min(1).optional(),
  })
  .strict()

export function createPoliciesRouter(input: {
  defaultPolicy: ModelPolicy
  now: () => string
  policyStore: PolicyStore
  registry: Registry
}): Router {
  const router = Router()

  router.get('/', async (_request, response, next) => {
    try {
      const policies = await input.policyStore.list()
      response.json({
        data: policies,
      })
    } catch (error) {
      next(error)
    }
  })

  router.post('/resolve', async (request, response, next) => {
    try {
      const parsed = resolvePolicyRequestSchema.safeParse(request.body)

      if (!parsed.success) {
        response.status(400).json({
          error: 'invalid_request',
          details: parsed.error.flatten(),
        })
        return
      }

      const subject = resolveSubject(parsed.data, input.registry)

      if (!subject) {
        response.status(404).json({
          error: 'agent_not_found',
          message: `No agent found for ${parsed.data.targetId}`,
        })
        return
      }

      const policies = await input.policyStore.list()
      const envelope = resolvePolicy({
        subject,
        defaultPolicy: input.defaultPolicy,
        policies,
      })
      const winningPolicy = envelope.appliedPolicies.at(-1)
      const resolvedPolicy = toResolvedPolicy({
        defaultPolicy: input.defaultPolicy,
        policies,
        subjectId: subject.id,
        resolvedAt: input.now(),
        winningPolicy,
        envelopeModel: envelope.model,
        envelopeOverrides: envelope.overrides,
      })

      response.json({
        data: {
          subject,
          resolvedPolicy,
          explanation: {
            appliedPolicies: envelope.appliedPolicies,
            attribution: envelope.attribution,
            appliesTo: envelope.appliesTo,
          },
        },
      })
    } catch (error) {
      next(error)
    }
  })

  return router
}

function resolveSubject(
  input: z.infer<typeof resolvePolicyRequestSchema>,
  registry: Registry,
): { id: string; unitType: string } | null {
  const unit = registry.getUnit(input.targetId)

  if (unit) {
    return {
      id: unit.id,
      unitType: unit.unitType,
    }
  }

  if (!input.unitType) {
    return null
  }

  const parsedTarget = parseConnectorQualifiedId(input.targetId)

  if (!parsedTarget) {
    return null
  }

  return {
    id: input.targetId,
    unitType: input.unitType,
  }
}

function toResolvedPolicy(input: {
  defaultPolicy: ModelPolicy
  policies: PolicyLayer[]
  subjectId: string
  resolvedAt: string
  winningPolicy: { policyId: string; scope: PolicyLayer['scope']; source: PolicySource } | undefined
  envelopeModel: ModelPolicy
  envelopeOverrides: Record<string, JsonValue>
}): ResolvedPolicy {
  const parsedSubject = parseConnectorQualifiedId(input.subjectId)

  return {
    id: input.winningPolicy?.policyId ?? 'resolved-default',
    scope: toSharedPolicyScope(input.winningPolicy?.scope),
    source: input.winningPolicy?.source ?? PolicySource.Default,
    connectorId: parsedSubject?.connectorId ?? null,
    targetId: input.subjectId,
    model: input.envelopeModel,
    overrides: input.envelopeOverrides,
    resolvedAt: input.resolvedAt,
  }
}

function toSharedPolicyScope(scope: PolicyLayer['scope'] | undefined): PolicyScope {
  switch (scope) {
    case 'unit':
      return PolicyScope.Agent
    case 'type':
      return PolicyScope.Connector
    case 'global':
    default:
      return PolicyScope.Global
  }
}
