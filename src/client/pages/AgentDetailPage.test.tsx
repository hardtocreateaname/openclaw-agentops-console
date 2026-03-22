import { render, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'

import '../test/server'
import { server } from '../test/server'
import { AgentDetailPage } from './AgentDetailPage'

describe('AgentDetailPage', () => {
  it('renders recent output, anomalies, supported actions, and fallback details', async () => {
    server.use(
      http.post('/api/policies/resolve', () =>
        HttpResponse.json({
          data: {
            subject: {
              id: 'subagents:subagent-002',
              unitType: 'subagent',
            },
            resolvedPolicy: {
              id: 'type-subagent-default',
              scope: 'connector',
              source: 'connector',
              connectorId: 'subagents',
              targetId: 'subagents:subagent-002',
              model: {
                provider: 'anthropic',
                model: 'claude-3.7-sonnet',
                temperature: 0.2,
                maxOutputTokens: 4096,
                toolChoice: 'auto',
                allowedCapabilities: ['run:read'],
                systemPrompt: 'Keep fallback escalations narrow and auditable.',
              },
              overrides: {
                escalation: 'operator',
                reviewLane: 'execution',
              },
              resolvedAt: '2026-03-22T00:00:00.000Z',
            },
            explanation: {
              appliedPolicies: [
                { policyId: 'global-default', scope: 'global', source: 'default' },
                { policyId: 'type-subagent-default', scope: 'type', source: 'connector' },
              ],
              attribution: {
                model: {
                  systemPrompt: {
                    policyId: 'type-subagent-default',
                    scope: 'type',
                    source: 'connector',
                  },
                },
                overrides: {
                  escalation: {
                    policyId: 'type-subagent-default',
                    scope: 'type',
                    source: 'connector',
                  },
                },
                appliesToMetadata: {},
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

    render(<AgentDetailPage agentId="subagents:subagent-002" />)

    expect(await screen.findByRole('heading', { name: 'writer' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Latest runtime events' })).toBeInTheDocument()
    expect(screen.getByText('Agent registered')).toBeInTheDocument()

    const anomalies = screen.getByRole('heading', { name: 'Observed runtime signals' }).closest('article')
    expect(within(anomalies ?? document.body).getByText(/configured latency threshold/i)).toBeInTheDocument()
    expect(within(anomalies ?? document.body).getByText(/operating in fallback mode/i)).toBeInTheDocument()

    expect(screen.getByLabelText('Supported actions')).toHaveTextContent('Read-only runtime')
    expect(screen.getByText('Configured fallback policy')).toBeInTheDocument()
    expect(screen.getByText(/Escalate to operator; route review through execution/i)).toBeInTheDocument()
    expect(screen.getByText('Observed fallback reason')).toBeInTheDocument()
    expect(screen.getAllByText(/operating in fallback mode/i).length).toBeGreaterThan(0)
  })
})
