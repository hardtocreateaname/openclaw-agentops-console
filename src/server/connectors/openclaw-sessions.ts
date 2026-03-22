import type { JsonValue } from '../../shared/types'
import {
  createDefaultOpenClawSourcesConfig,
  listOpenClawSessions,
  type OpenClawSessionSourceSnapshot,
  type OpenClawSourcesConfig,
} from '../integrations/openclaw-sources'
import { createOpenClawSessionsFixtureConnector } from './fixture/openclaw-sessions-fixture'
import {
  toConnectorQualifiedId,
  type ConnectorAdapter,
  type ConnectorUnitSnapshot,
} from './types'

const CONNECTOR_ID = 'sessions'

export interface OpenClawSessionsConnectorOptions {
  onWarning?: (message: string, error: unknown) => void
  sourcesConfig?: OpenClawSourcesConfig
}

export function createOpenClawSessionsConnector(
  options: OpenClawSessionsConnectorOptions = {},
): ConnectorAdapter {
  const fallbackConnector = createOpenClawSessionsFixtureConnector()
  const sourcesConfig = options.sourcesConfig ?? createDefaultOpenClawSourcesConfig()

  return {
    id: CONNECTOR_ID,
    displayName: 'OpenClaw Sessions',
    async listUnits() {
      try {
        const units = await listOpenClawSessions(sourcesConfig)
        return units.map((unit) => toSessionUnit(unit))
      } catch (error) {
        const warning = formatWarning('sessions', sourcesConfig.historyPath)
        options.onWarning?.(warning, error)
        return withFallbackMetadata(await fallbackConnector.listUnits(), warning)
      }
    },
  }
}

function toSessionUnit(source: OpenClawSessionSourceSnapshot): ConnectorUnitSnapshot {
  return {
    id: toConnectorQualifiedId(CONNECTOR_ID, source.sourceId),
    connectorId: CONNECTOR_ID,
    unitType: 'session',
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
