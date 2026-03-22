import { describe, expect, it } from 'vitest'

import {
  ConnectorCapability,
  ModelProvider,
  PolicySource,
  ToolChoiceMode,
  type ModelPolicy,
} from '../../shared/types'

import { resolvePolicy, type PolicyLayer } from './policy-engine'

const DEFAULT_POLICY: ModelPolicy = {
  provider: ModelProvider.OpenAI,
  model: 'gpt-5.4',
  temperature: 0.2,
  maxOutputTokens: 2048,
  toolChoice: ToolChoiceMode.Auto,
  allowedCapabilities: [ConnectorCapability.SessionRead],
  systemPrompt: 'Default prompt',
}

describe('resolvePolicy', () => {
  it('resolves policy precedence from global to type to unit', () => {
    const policies: PolicyLayer[] = [
      {
        id: 'global-default',
        scope: 'global',
        source: PolicySource.Default,
        model: {
          temperature: 0.4,
          systemPrompt: 'Global prompt',
        },
        overrides: {
          routing: 'global',
        },
      },
      {
        id: 'type-subagent',
        scope: 'type',
        source: PolicySource.Connector,
        targetType: 'subagent',
        model: {
          maxOutputTokens: 4096,
          allowedCapabilities: [
            ConnectorCapability.SessionRead,
            ConnectorCapability.RunRead,
          ],
        },
        overrides: {
          routing: 'type',
        },
      },
      {
        id: 'unit-subagent-01',
        scope: 'unit',
        source: PolicySource.Runtime,
        targetId: 'subagents:subagent-01',
        model: {
          systemPrompt: 'Unit prompt',
        },
        overrides: {
          escalation: 'manual',
        },
      },
    ]

    const resolved = resolvePolicy({
      subject: {
        id: 'subagents:subagent-01',
        unitType: 'subagent',
      },
      defaultPolicy: DEFAULT_POLICY,
      policies,
    })

    expect(resolved.model.temperature).toBe(0.4)
    expect(resolved.model.maxOutputTokens).toBe(4096)
    expect(resolved.model.systemPrompt).toBe('Unit prompt')
    expect(resolved.model.allowedCapabilities).toEqual([
      ConnectorCapability.SessionRead,
      ConnectorCapability.RunRead,
    ])
    expect(resolved.overrides).toEqual({
      routing: 'type',
      escalation: 'manual',
    })
    expect(resolved.appliedPolicies.map((policy) => policy.policyId)).toEqual([
      'global-default',
      'type-subagent',
      'unit-subagent-01',
    ])
  })

  it('tracks source attribution for the winning policy values', () => {
    const resolved = resolvePolicy({
      subject: {
        id: 'sessions:sess-001',
        unitType: 'session',
      },
      defaultPolicy: DEFAULT_POLICY,
      policies: [
        {
          id: 'global-default',
          scope: 'global',
          source: PolicySource.Default,
          model: {
            temperature: 0.5,
          },
        },
        {
          id: 'session-operator',
          scope: 'unit',
          source: PolicySource.Operator,
          targetId: 'sessions:sess-001',
          model: {
            temperature: 0.1,
          },
          overrides: {
            handoff: 'operator',
          },
        },
      ],
    })

    expect(resolved.attribution.model.temperature).toEqual({
      policyId: 'session-operator',
      scope: 'unit',
      source: PolicySource.Operator,
    })
    expect(resolved.attribution.overrides.handoff).toEqual({
      policyId: 'session-operator',
      scope: 'unit',
      source: PolicySource.Operator,
    })
  })

  it('merges appliesTo metadata and preserves future and waiting attribution', () => {
    const resolved = resolvePolicy({
      subject: {
        id: 'subagents:subagent-02',
        unitType: 'subagent',
      },
      defaultPolicy: DEFAULT_POLICY,
      policies: [
        {
          id: 'global-default',
          scope: 'global',
          source: PolicySource.Default,
          appliesTo: {
            metadata: {
              future: false,
            },
          },
        },
        {
          id: 'type-subagent',
          scope: 'type',
          source: PolicySource.Connector,
          targetType: 'subagent',
          appliesTo: {
            metadata: {
              waiting: true,
            },
          },
        },
        {
          id: 'unit-subagent-02',
          scope: 'unit',
          source: PolicySource.Runtime,
          targetId: 'subagents:subagent-02',
          appliesTo: {
            metadata: {
              future: true,
            },
          },
        },
      ],
    })

    expect(resolved.appliesTo.metadata).toEqual({
      future: true,
      waiting: true,
    })
    expect(resolved.attribution.appliesToMetadata.future).toEqual({
      policyId: 'unit-subagent-02',
      scope: 'unit',
      source: PolicySource.Runtime,
    })
    expect(resolved.attribution.appliesToMetadata.waiting).toEqual({
      policyId: 'type-subagent',
      scope: 'type',
      source: PolicySource.Connector,
    })
  })
})
