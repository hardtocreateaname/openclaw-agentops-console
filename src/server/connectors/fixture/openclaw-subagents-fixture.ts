import { toConnectorQualifiedId, type ConnectorAdapter } from '../types'

const CONNECTOR_ID = 'subagents'
const FIXTURE_TIMESTAMP = '2026-03-22T00:00:00.000Z'

export function createOpenClawSubagentsFixtureConnector(): ConnectorAdapter {
  return {
    id: CONNECTOR_ID,
    displayName: 'OpenClaw Subagents Fixture',
    isFixture: true,
    listUnits() {
      return [
        {
          id: toConnectorQualifiedId(CONNECTOR_ID, 'subagent-001'),
          connectorId: CONNECTOR_ID,
          unitType: 'subagent',
          name: 'planner',
          lifecycle: 'running',
          lastSeenAt: FIXTURE_TIMESTAMP,
          lastProgressAt: '2026-03-21T23:59:50.000Z',
          latencyMs: 310,
          fallbackActive: false,
          controllable: true,
          metadata: {
            sessionId: 'sessions:sess-001',
            lane: 'analysis',
          },
        },
        {
          id: toConnectorQualifiedId(CONNECTOR_ID, 'subagent-002'),
          connectorId: CONNECTOR_ID,
          unitType: 'subagent',
          name: 'writer',
          lifecycle: 'running',
          lastSeenAt: FIXTURE_TIMESTAMP,
          lastProgressAt: '2026-03-21T23:40:00.000Z',
          latencyMs: 1800,
          fallbackActive: true,
          controllable: false,
          metadata: {
            sessionId: 'sessions:sess-002',
            lane: 'execution',
          },
        },
      ]
    },
  }
}
