import { describe, expect, it } from 'vitest'

import {
  actionResultSchema,
  agentUnitSchema,
  connectorQualifiedIdSchema,
  modelPolicySchema,
  normalizedEventSchema,
  resolvedPolicySchema,
} from './schemas'
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
} from './types'

describe('connectorQualifiedIdSchema', () => {
  it('parses connector-qualified IDs', () => {
    expect(connectorQualifiedIdSchema.parse('sessions:abc123')).toBe('sessions:abc123')
  })

  it('rejects IDs without a connector prefix', () => {
    expect(() => connectorQualifiedIdSchema.parse('abc123')).toThrow(/connector-qualified ID/)
  })
})

describe('shared schemas', () => {
  it('parses an agent unit payload', () => {
    const parsed = agentUnitSchema.parse({
      id: 'sessions:agent-01',
      connectorId: 'sessions',
      sessionId: 'sessions:abc123',
      name: 'triage-agent',
      model: 'gpt-5.4',
      provider: ModelProvider.OpenAI,
      status: AgentStatus.Running,
      capabilities: [ConnectorCapability.SessionRead, ConnectorCapability.EventStream],
      lastSeenAt: '2026-03-22T00:00:00.000Z',
      metadata: {
        retryCount: 2,
        active: true,
      },
    })

    expect(parsed.connectorId).toBe('sessions')
    expect(parsed.sessionId).toBe('sessions:abc123')
  })

  it('parses policy, action result, and normalized event payloads', () => {
    const modelPolicy = modelPolicySchema.parse({
      provider: ModelProvider.OpenAI,
      model: 'gpt-5.4',
      temperature: 0.2,
      maxOutputTokens: 2048,
      toolChoice: ToolChoiceMode.Auto,
      allowedCapabilities: [ConnectorCapability.PolicyResolve],
      systemPrompt: 'Keep the operator informed.',
    })

    const resolvedPolicy = resolvedPolicySchema.parse({
      id: 'policy-runtime',
      scope: PolicyScope.Agent,
      source: PolicySource.Runtime,
      connectorId: 'sessions',
      targetId: 'sessions:agent-01',
      model: modelPolicy,
      overrides: {
        escalation: 'manual',
      },
      resolvedAt: '2026-03-22T00:00:00.000Z',
    })

    const actionResult = actionResultSchema.parse({
      id: 'action-01',
      action: ActionKind.Approve,
      status: ActionStatus.Completed,
      targetId: 'sessions:agent-01',
      message: 'Approved by operator',
      error: null,
      createdAt: '2026-03-22T00:00:00.000Z',
      completedAt: '2026-03-22T00:00:05.000Z',
    })

    const normalizedEvent = normalizedEventSchema.parse({
      id: 'event-01',
      kind: EventKind.ActionCompleted,
      connectorId: 'sessions',
      subjectId: 'sessions:agent-01',
      sessionId: 'sessions:abc123',
      agentId: 'sessions:agent-01',
      occurredAt: '2026-03-22T00:00:05.000Z',
      payload: {
        actionResult,
        resolvedPolicy,
      },
    })

    expect(normalizedEvent.payload).toMatchObject({
      actionResult: { status: ActionStatus.Completed },
      resolvedPolicy: { source: PolicySource.Runtime },
    })
  })

  it('rejects malformed connector IDs in event payloads', () => {
    expect(() =>
      normalizedEventSchema.parse({
        id: 'event-02',
        kind: EventKind.SessionStarted,
        connectorId: 'Sessions',
        subjectId: 'sessions:abc123',
        sessionId: 'sessions:abc123',
        agentId: null,
        occurredAt: '2026-03-22T00:00:05.000Z',
        payload: {},
      }),
    ).toThrow(/lowercase slug/)
  })
})
