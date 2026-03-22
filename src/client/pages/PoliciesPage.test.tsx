import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'

import '../test/server'
import { server } from '../test/server'
import { PoliciesPage } from './PoliciesPage'

describe('PoliciesPage', () => {
  it('renders editing surfaces and a resolution preview with attribution', async () => {
    server.use(
      http.get('/api/policies', () =>
        HttpResponse.json({
          data: [
            {
              id: 'global-default',
              scope: 'global',
              source: 'default',
              model: {
                provider: 'openai',
                model: 'gpt-5.4',
                systemPrompt: 'Default operator prompt.',
              },
              overrides: {
                approvalMode: 'manual',
              },
              appliesTo: {
                metadata: {
                  future: false,
                },
              },
            },
            {
              id: 'type-subagent-default',
              scope: 'type',
              source: 'connector',
              targetType: 'subagent',
              model: {
                model: 'gpt-5.4',
                systemPrompt: 'Subagent runtime defaults.',
              },
              overrides: {
                reviewLane: 'analysis',
              },
            },
            {
              id: 'unit-subagent-001-runtime',
              scope: 'unit',
              source: 'runtime',
              targetId: 'subagents:subagent-001',
              model: {
                systemPrompt: 'Prioritize planner escalation paths.',
              },
              overrides: {
                escalation: 'operator',
              },
              appliesTo: {
                metadata: {
                  waiting: false,
                },
              },
            },
          ],
        }),
      ),
      http.post('/api/policies/resolve', () =>
        HttpResponse.json({
          data: {
            subject: {
              id: 'subagents:subagent-001',
              unitType: 'subagent',
            },
            resolvedPolicy: {
              id: 'unit-subagent-001-runtime',
              scope: 'agent',
              source: 'runtime',
              connectorId: 'subagents',
              targetId: 'subagents:subagent-001',
              model: {
                provider: 'openai',
                model: 'gpt-5.4',
                temperature: 0.2,
                maxOutputTokens: 4096,
                toolChoice: 'auto',
                allowedCapabilities: ['session:read', 'run:read'],
                systemPrompt: 'Prioritize planner escalation paths.',
              },
              overrides: {
                approvalMode: 'manual',
                reviewLane: 'analysis',
                escalation: 'operator',
              },
              resolvedAt: '2026-03-22T00:00:00.000Z',
            },
            explanation: {
              appliedPolicies: [
                { policyId: 'global-default', scope: 'global', source: 'default' },
                { policyId: 'type-subagent-default', scope: 'type', source: 'connector' },
                { policyId: 'unit-subagent-001-runtime', scope: 'unit', source: 'runtime' },
              ],
              attribution: {
                model: {
                  systemPrompt: {
                    policyId: 'unit-subagent-001-runtime',
                    scope: 'unit',
                    source: 'runtime',
                  },
                },
                overrides: {
                  escalation: {
                    policyId: 'unit-subagent-001-runtime',
                    scope: 'unit',
                    source: 'runtime',
                  },
                  reviewLane: {
                    policyId: 'type-subagent-default',
                    scope: 'type',
                    source: 'connector',
                  },
                },
                appliesToMetadata: {
                  waiting: {
                    policyId: 'unit-subagent-001-runtime',
                    scope: 'unit',
                    source: 'runtime',
                  },
                },
              },
              appliesTo: {
                metadata: {
                  waiting: false,
                },
              },
            },
          },
        }),
      ),
    )

    render(<PoliciesPage />)

    expect(await screen.findByRole('heading', { name: 'Layered runtime controls' })).toBeInTheDocument()
    expect(screen.getByLabelText('Global policy model')).toBeInTheDocument()
    expect(screen.getByLabelText('Type policy system prompt')).toBeInTheDocument()
    expect(screen.getByLabelText('Unit policy applies-to metadata')).toBeInTheDocument()
    expect(screen.getByLabelText('Application scope target')).toBeInTheDocument()

    expect(await screen.findByRole('heading', { name: /Effective policy for subagents:subagent-001/i })).toBeInTheDocument()
    expect(screen.getByText('Application scope')).toBeInTheDocument()
    expect(screen.getByText('waiting=false')).toBeInTheDocument()
    expect(screen.getByText('Source attribution')).toBeInTheDocument()
    expect(screen.getAllByText('unit-subagent-001-runtime').length).toBeGreaterThan(0)
  })
})
