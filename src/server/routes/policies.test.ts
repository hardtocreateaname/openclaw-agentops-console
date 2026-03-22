import request from 'supertest'
import { describe, expect, it } from 'vitest'

import { PolicySource } from '../../shared/types'
import { createApp } from '../app'
import { DEFAULT_MODEL_POLICY, DEFAULT_POLICY_LAYERS } from '../config'
import { MemoryPolicyStore } from '../store/policy-store'

describe('policies routes', () => {
  it('lists configured policy layers', async () => {
    const app = await createApp({
      now: () => '2026-03-22T00:00:00.000Z',
      policyStore: new MemoryPolicyStore(DEFAULT_POLICY_LAYERS),
    })

    const response = await request(app).get('/api/policies').expect(200)

    expect(response.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'global-default',
          scope: 'global',
        }),
      ]),
    )
  })

  it('resolves policy for a known agent with attribution details', async () => {
    const app = await createApp({
      defaultPolicy: DEFAULT_MODEL_POLICY,
      now: () => '2026-03-22T00:00:00.000Z',
      policyStore: new MemoryPolicyStore(DEFAULT_POLICY_LAYERS),
    })

    const response = await request(app)
      .post('/api/policies/resolve')
      .send({
        targetId: 'subagents:subagent-001',
      })
      .expect(200)

    expect(response.body.data.subject).toEqual({
      id: 'subagents:subagent-001',
      unitType: 'subagent',
    })
    expect(response.body.data.resolvedPolicy).toEqual(
      expect.objectContaining({
        id: 'unit-subagent-001-runtime',
        source: PolicySource.Runtime,
        targetId: 'subagents:subagent-001',
        model: expect.objectContaining({
          maxOutputTokens: 4096,
          systemPrompt: 'Prioritize planner escalation paths.',
        }),
        overrides: expect.objectContaining({
          escalation: 'operator',
          reviewLane: 'analysis',
        }),
      }),
    )
    expect(response.body.data.explanation).toEqual(
      expect.objectContaining({
        appliedPolicies: [
          expect.objectContaining({
            policyId: 'global-default',
            source: PolicySource.Default,
          }),
          expect.objectContaining({
            policyId: 'type-subagent-default',
            source: PolicySource.Connector,
          }),
          expect.objectContaining({
            policyId: 'unit-subagent-001-runtime',
            source: PolicySource.Runtime,
          }),
        ],
        attribution: expect.objectContaining({
          model: expect.objectContaining({
            systemPrompt: expect.objectContaining({
              policyId: 'unit-subagent-001-runtime',
            }),
          }),
        }),
      }),
    )
  })
})
