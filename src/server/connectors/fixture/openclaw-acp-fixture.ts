import { createMemoryEventEmitter, toConnectorQualifiedId, type ConnectorAdapter } from '../types'

const CONNECTOR_ID = 'acp'
const FIXTURE_TIMESTAMP = '2026-03-22T00:00:00.000Z'

export function createOpenClawAcpFixtureConnector(): ConnectorAdapter {
  const emitter = createMemoryEventEmitter()

  return {
    id: CONNECTOR_ID,
    displayName: 'OpenClaw ACP Fixture',
    isFixture: true,
    listUnits() {
      return [
        {
          id: toConnectorQualifiedId(CONNECTOR_ID, 'proc-001'),
          connectorId: CONNECTOR_ID,
          unitType: 'acp_process',
          name: 'policy-sync',
          lifecycle: 'idle',
          lastSeenAt: FIXTURE_TIMESTAMP,
          lastProgressAt: FIXTURE_TIMESTAMP,
          latencyMs: 40,
          fallbackActive: false,
          controllable: true,
          metadata: {
            host: 'agentops-dev-01',
          },
        },
      ]
    },
    subscribe(listener) {
      return emitter.subscribe(listener)
    },
  }
}
