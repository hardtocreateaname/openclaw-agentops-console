import type { JsonValue } from '../../shared/types'
import {
  createDefaultOpenClawSourcesConfig,
  listOpenClawAcpUnits,
  type OpenClawAcpSourceSnapshot,
  type OpenClawSourcesConfig,
} from '../integrations/openclaw-sources'
import { createOpenClawAcpFixtureConnector } from './fixture/openclaw-acp-fixture'
import {
  toConnectorQualifiedId,
  type ConnectorAdapter,
  type ConnectorUnitSnapshot,
} from './types'

const CONNECTOR_ID = 'acp'

export interface OpenClawAcpConnectorOptions {
  onWarning?: (message: string, error: unknown) => void
  sourcesConfig?: OpenClawSourcesConfig
}

export function createOpenClawAcpConnector(
  options: OpenClawAcpConnectorOptions = {},
): ConnectorAdapter {
  const fallbackConnector = createOpenClawAcpFixtureConnector()
  const sourcesConfig = options.sourcesConfig ?? createDefaultOpenClawSourcesConfig()

  return {
    id: CONNECTOR_ID,
    displayName: 'OpenClaw ACP',
    subscribe(listener) {
      return fallbackConnector.subscribe?.(listener) ?? { unsubscribe() {} }
    },
    async listUnits() {
      try {
        const units = await listOpenClawAcpUnits(sourcesConfig)
        return units.map((unit) => toAcpUnit(unit))
      } catch (error) {
        const warning = formatWarning('acp', sourcesConfig.tuiLogPath)
        options.onWarning?.(warning, error)
        return withFallbackMetadata(await fallbackConnector.listUnits(), warning)
      }
    },
  }
}

function toAcpUnit(source: OpenClawAcpSourceSnapshot): ConnectorUnitSnapshot {
  return {
    id: toConnectorQualifiedId(CONNECTOR_ID, source.sourceId),
    connectorId: CONNECTOR_ID,
    unitType: 'acp_process',
    name: source.name,
    lifecycle: source.lifecycle,
    lastSeenAt: source.lastSeenAt,
    lastProgressAt: source.lastProgressAt,
    latencyMs: source.latencyMs,
    fallbackActive: false,
    controllable: source.controllable,
    metadata: source.metadata,
  }
}

function withFallbackMetadata(
  units: ConnectorUnitSnapshot[],
  warning: string,
): ConnectorUnitSnapshot[] {
  return units.map((unit) => ({
    ...unit,
    fallbackActive: true,
    metadata: {
      ...unit.metadata,
      sourceMode: 'fallback',
      sourceWarning: warning,
    } satisfies Record<string, JsonValue>,
  }))
}

function formatWarning(sourceName: string, sourcePath: string): string {
  return `OpenClaw ${sourceName} source unavailable at ${sourcePath}; using fixture snapshots`
}
