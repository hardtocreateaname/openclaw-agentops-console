import { z } from 'zod'

import {
  ActionKind,
  ActionStatus,
  AgentStatus,
  ConnectorCapability,
  EventKind,
  ModelProvider,
  PolicyScope,
  PolicySource,
  ToolChoiceMode,
  type ActionResult,
  type AgentUnit,
  type JsonValue,
  type ModelPolicy,
  type NormalizedEvent,
  type ResolvedPolicy,
} from './types'

export const connectorIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_-]*$/, 'Connector IDs must be lowercase slug values')

export const connectorQualifiedIdSchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9_-]*:[A-Za-z0-9][A-Za-z0-9._:-]*$/,
    'Expected connector-qualified ID in the form connector:entity',
  )

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema),
  ]),
)

export const metadataSchema = z.record(jsonValueSchema)

export const agentUnitSchema: z.ZodType<AgentUnit> = z.object({
  id: connectorQualifiedIdSchema,
  connectorId: connectorIdSchema,
  sessionId: connectorQualifiedIdSchema.nullable(),
  name: z.string().min(1),
  model: z.string().min(1),
  provider: z.nativeEnum(ModelProvider),
  status: z.nativeEnum(AgentStatus),
  capabilities: z.array(z.nativeEnum(ConnectorCapability)),
  lastSeenAt: z.string().datetime(),
  metadata: metadataSchema,
})

export const modelPolicySchema: z.ZodType<ModelPolicy> = z.object({
  provider: z.nativeEnum(ModelProvider),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2).nullable(),
  maxOutputTokens: z.number().int().positive().nullable(),
  toolChoice: z.nativeEnum(ToolChoiceMode),
  allowedCapabilities: z.array(z.nativeEnum(ConnectorCapability)),
  systemPrompt: z.string().min(1).nullable(),
})

export const resolvedPolicySchema: z.ZodType<ResolvedPolicy> = z.object({
  id: z.string().min(1),
  scope: z.nativeEnum(PolicyScope),
  source: z.nativeEnum(PolicySource),
  connectorId: connectorIdSchema.nullable(),
  targetId: connectorQualifiedIdSchema.nullable(),
  model: modelPolicySchema,
  overrides: metadataSchema,
  resolvedAt: z.string().datetime(),
})

export const actionResultSchema: z.ZodType<ActionResult> = z.object({
  id: z.string().min(1),
  action: z.nativeEnum(ActionKind),
  status: z.nativeEnum(ActionStatus),
  targetId: connectorQualifiedIdSchema,
  message: z.string().min(1).nullable(),
  error: z.string().min(1).nullable(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
})

export const normalizedEventSchema: z.ZodType<NormalizedEvent> = z.object({
  id: z.string().min(1),
  kind: z.nativeEnum(EventKind),
  connectorId: connectorIdSchema,
  subjectId: connectorQualifiedIdSchema,
  sessionId: connectorQualifiedIdSchema.nullable(),
  agentId: connectorQualifiedIdSchema.nullable(),
  occurredAt: z.string().datetime(),
  payload: metadataSchema,
})

export const sharedSchemas = {
  connectorId: connectorIdSchema,
  connectorQualifiedId: connectorQualifiedIdSchema,
  agentUnit: agentUnitSchema,
  modelPolicy: modelPolicySchema,
  resolvedPolicy: resolvedPolicySchema,
  actionResult: actionResultSchema,
  normalizedEvent: normalizedEventSchema,
}
