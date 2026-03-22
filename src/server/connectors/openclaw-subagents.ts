import type { JsonValue } from '../../shared/types'
import {
  createDefaultOpenClawSourcesConfig,
  listOpenClawSubagents,
  type OpenClawSourcesConfig,
  type OpenClawSubagentSourceSnapshot,
} from '../integrations/openclaw-sources'
import { createOpenClawSubagentsFixtureConnector } from './fixture/openclaw-subagents-fixture'
import {
  toConnectorQualifiedId,
  type ConnectorAdapter,
  type ConnectorUnitSnapshot,
} from './types'

const CONNECTOR_ID = 'subagents'

export interface OpenClawSubagentsConnectorOptions {
  onWarning?: (message: string, error: unknown) => void
  sourcesConfig?: OpenClawSourcesConfig
}

export function createOpenClawSubagentsConnector(
  options: OpenClawSubagentsConnectorOptions = {},
): ConnectorAdapter {
  const fallbackConnector = createOpenClawSubagentsFixtureConnector()
  const sourcesConfig = options.sourcesConfig ?? createDefaultOpenClawSourcesConfig()

  return {
    id: CONNECTOR_ID,
    displayName: 'OpenClaw Subagents',
    async listUnits() {
      try {
        const units = await listOpenClawSubagents(sourcesConfig)
        return units.map((unit) => toSubagentUnit(unit))
      } catch (error) {
        const warning = formatWarning('subagents', sourcesConfig.tuiLogPath)
        options.onWarning?.(warning, error)
        return withFallbackMetadata(await fallbackConnector.listUnits(), warning)
      }
    },
  }
}

function toSubagentUnit(source: OpenClawSubagentSourceSnapshot): ConnectorUnitSnapshot {
  return {
    id: toConnectorQualifiedId(CONNECTOR_ID, source.sourceId),
    connectorId: CONNECTOR_ID,
    unitType: 'subagent',
    name: source.name,
    lifecycle: source.lifecycle,
    lastSeenAt: source.lastSeenAt,
    lastProgressAt: source.lastProgressAt,
    latencyMs: source.latencyMs,
    fallbackActive: false,
    controllable: source.controllable,
    metadata: {
      ...source.metadata,
      sessionId:
        source.sessionSourceId === null
          ? null
          : toConnectorQualifiedId('sessions', source.sessionSourceId),
    },
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
