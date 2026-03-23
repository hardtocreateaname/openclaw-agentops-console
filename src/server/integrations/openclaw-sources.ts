import os from 'node:os'
import path from 'node:path'
import { stat, readFile } from 'node:fs/promises'

import { EventKind, ModelProvider, type JsonValue, type NormalizedEvent } from '../../shared/types'
import type { ConnectorUnitLifecycle } from '../connectors/types'

const DEFAULT_HISTORY_RELATIVE_PATH = ['.codex', 'history.jsonl']
const DEFAULT_TUI_LOG_RELATIVE_PATH = ['.codex', 'log', 'codex-tui.log']
const DEFAULT_VERSION_RELATIVE_PATH = ['.codex', 'version.json']
const MAX_EVENT_SNAPSHOTS = 50
const SESSION_LABEL_MAX_CHARS = 48
const PROMPT_PREVIEW_MAX_CHARS = 160
const RECENT_SESSION_WINDOW_MS = 15 * 60 * 1000
const STALE_SESSION_WINDOW_MS = 6 * 60 * 60 * 1000

export interface OpenClawSourcesConfig {
  historyPath: string
  tuiLogPath: string
  versionPath: string
}

export interface OpenClawSessionSourceSnapshot {
  sourceId: string
  name: string
  lifecycle: ConnectorUnitLifecycle
  lastSeenAt: string
  lastProgressAt: string | null
  latencyMs: number | null
  controllable: boolean
  metadata: Record<string, JsonValue>
}

export interface OpenClawSubagentSourceSnapshot {
  sourceId: string
  sessionSourceId: string | null
  name: string
  lifecycle: ConnectorUnitLifecycle
  lastSeenAt: string
  lastProgressAt: string | null
  latencyMs: number | null
  controllable: boolean
  metadata: Record<string, JsonValue>
}

export interface OpenClawAcpSourceSnapshot {
  sourceId: string
  name: string
  lifecycle: ConnectorUnitLifecycle
  lastSeenAt: string
  lastProgressAt: string | null
  latencyMs: number | null
  controllable: boolean
  metadata: Record<string, JsonValue>
}

interface HistoryEntry {
  session_id: string
  ts: number
  text: string
}

interface VersionEntry {
  latest_version?: string
}

interface ParsedLogLine {
  occurredAt: string
  threadId: string | null
  isSubagent: boolean | null
  enabledMcpServerCount: number | null
  requiredMcpServerCount: number | null
  line: string
}

interface SessionSnapshotState {
  freshness: 'recent' | 'stale' | 'archived'
  lifecycle: ConnectorUnitLifecycle
  summary: string
}

export function createDefaultOpenClawSourcesConfig(): OpenClawSourcesConfig {
  const home = os.homedir()

  return {
    historyPath: path.join(home, ...DEFAULT_HISTORY_RELATIVE_PATH),
    tuiLogPath: path.join(home, ...DEFAULT_TUI_LOG_RELATIVE_PATH),
    versionPath: path.join(home, ...DEFAULT_VERSION_RELATIVE_PATH),
  }
}

export async function listOpenClawSessions(
  config: OpenClawSourcesConfig,
): Promise<OpenClawSessionSourceSnapshot[]> {
  const entries = await readHistoryEntries(config.historyPath)
  const latestBySessionId = new Map<string, HistoryEntry>()

  for (const entry of entries) {
    const existing = latestBySessionId.get(entry.session_id)

    if (!existing || entry.ts >= existing.ts) {
      latestBySessionId.set(entry.session_id, entry)
    }
  }

  return [...latestBySessionId.values()]
    .sort((left, right) => right.ts - left.ts)
    .map((entry) => {
      const lastSeenAt = toIsoTimestamp(entry.ts)
      const workspace = matchWorkspace(entry.text)
      const snapshotState = inferSessionSnapshotState(entry.ts)
      const promptPreview = summarizePromptPreview(entry.text)
      const sessionLabel = summarizeSessionLabel(entry.text)

      return {
        sourceId: entry.session_id,
        name: sessionLabel,
        lifecycle: snapshotState.lifecycle,
        lastSeenAt,
        lastProgressAt: lastSeenAt,
        latencyMs: null,
        controllable: true,
        metadata: {
          provider: ModelProvider.OpenAI,
          model: 'gpt-5.4',
          workspace,
          promptPreview,
          promptLabel: sessionLabel,
          promptChars: entry.text.length,
          snapshotFreshness: snapshotState.freshness,
          snapshotSummary: snapshotState.summary,
          sourceKind: 'codex-history',
        },
      }
    })
}

export async function listOpenClawSubagents(
  config: OpenClawSourcesConfig,
): Promise<OpenClawSubagentSourceSnapshot[]> {
  const logLines = await readParsedLogLines(config.tuiLogPath)
  const latestByThreadId = new Map<string, ParsedLogLine>()

  for (const line of logLines) {
    if (line.threadId === null || line.isSubagent !== true) {
      continue
    }

    latestByThreadId.set(line.threadId, line)
  }

  return [...latestByThreadId.values()]
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
    .map((line) => ({
      sourceId: line.threadId!,
      sessionSourceId: null,
      name: `subagent ${line.threadId!.slice(0, 8)}`,
      lifecycle: 'running',
      lastSeenAt: line.occurredAt,
      lastProgressAt: line.occurredAt,
      latencyMs: null,
      controllable: false,
      metadata: {
        provider: ModelProvider.OpenAI,
        model: 'gpt-5.4',
        sourceKind: 'codex-log',
        rawLine: line.line,
      },
    }))
}

export async function listOpenClawAcpUnits(
  config: OpenClawSourcesConfig,
): Promise<OpenClawAcpSourceSnapshot[]> {
  const [logStat, version, logLines] = await Promise.all([
    stat(config.tuiLogPath),
    readVersion(config.versionPath),
    readParsedLogLines(config.tuiLogPath),
  ])
  const latestMcpLine = [...logLines]
    .reverse()
    .find((line) => line.enabledMcpServerCount !== null || line.requiredMcpServerCount !== null)
  const lastSeenAt = logStat.mtime.toISOString()

  return [
    {
      sourceId: 'codex-cli',
      name: 'Codex CLI ACP',
      lifecycle: inferLifecycleFromDate(logStat.mtime),
      lastSeenAt,
      lastProgressAt: lastSeenAt,
      latencyMs: null,
      controllable: false,
      metadata: {
        provider: ModelProvider.Local,
        model: 'codex-cli',
        sourceKind: 'codex-log',
        codexVersion: version?.latest_version ?? null,
        enabledMcpServerCount: latestMcpLine?.enabledMcpServerCount ?? 0,
        requiredMcpServerCount: latestMcpLine?.requiredMcpServerCount ?? 0,
      },
    },
  ]
}

export async function listOpenClawEventSnapshots(
  config: OpenClawSourcesConfig,
): Promise<NormalizedEvent[]> {
  const logLines = await readParsedLogLines(config.tuiLogPath)

  const events = logLines
    .filter((line) => line.threadId !== null)
    .map((line, index) => {
      const subjectId = `sessions:${line.threadId!}`
      const kind =
        line.line.includes('codex.op="user_turn"') || line.line.includes('op.dispatch.user_turn')
          ? EventKind.SessionUpdated
          : EventKind.SessionStarted

      return {
        id: `openclaw-log:${line.threadId}:${index}:${kind}`,
        kind,
        connectorId: 'sessions',
        subjectId,
        sessionId: subjectId,
        agentId: null,
        occurredAt: line.occurredAt,
        payload: {
          sourceKind: 'codex-log',
          isSubagent: line.isSubagent ?? false,
        },
      }
    })

  return dedupeEventSnapshots(events)
    .sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))
    .slice(0, MAX_EVENT_SNAPSHOTS)
}

async function readHistoryEntries(historyPath: string): Promise<HistoryEntry[]> {
  const content = await readFile(historyPath, 'utf8')

  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as Partial<HistoryEntry>

        if (
          typeof parsed.session_id === 'string' &&
          typeof parsed.ts === 'number' &&
          typeof parsed.text === 'string'
        ) {
          return [parsed as HistoryEntry]
        }
      } catch {
        return []
      }

      return []
    })
}

async function readParsedLogLines(logPath: string): Promise<ParsedLogLine[]> {
  const content = await readFile(logPath, 'utf8')

  return content
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => parseLogLine(line))
    .filter((line): line is ParsedLogLine => line !== null)
}

function parseLogLine(line: string): ParsedLogLine | null {
  const timestampMatch = /^(\d{4}-\d{2}-\d{2}T[^ ]+)/.exec(line)

  if (!timestampMatch) {
    return null
  }

  return {
    occurredAt: timestampMatch[1],
    threadId: matchValue(line, /thread(?:_id|\.id)=([0-9a-f-]+)/i),
    isSubagent: matchBoolean(line, /session_init\.is_subagent=(true|false)/),
    enabledMcpServerCount: matchNumber(line, /enabled_mcp_server_count=(\d+)/),
    requiredMcpServerCount: matchNumber(line, /required_mcp_server_count=(\d+)/),
    line,
  }
}

async function readVersion(versionPath: string): Promise<VersionEntry | null> {
  try {
    const content = await readFile(versionPath, 'utf8')
    return JSON.parse(content) as VersionEntry
  } catch {
    return null
  }
}

function summarizeSessionLabel(text: string): string {
  const normalized = normalizePromptText(text)

  if (!normalized) {
    return 'OpenClaw session'
  }

  const sentence = normalized.split(/[.!?](?:\s|$)/, 1)[0] ?? normalized
  const clause = sentence.split(/[;:]/, 1)[0] ?? sentence
  const compact = clause.replace(/\s+/g, ' ').trim()

  return truncateText(compact || normalized, SESSION_LABEL_MAX_CHARS)
}

function summarizePromptPreview(text: string): string {
  const normalized = normalizePromptText(text)

  if (!normalized) {
    return 'OpenClaw session'
  }

  return truncateText(normalized, PROMPT_PREVIEW_MAX_CHARS)
}

function normalizePromptText(text: string): string {
  const firstLine = text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  if (!firstLine) {
    return ''
  }

  return firstLine.replace(/\s+/g, ' ').trim()
}

function truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value
  }

  return `${value.slice(0, maxChars - 3).trimEnd()}...`
}

function matchWorkspace(text: string): string | null {
  return matchValue(text, /(\/root\/workspace\/[^\s]+)/)
}

function inferLifecycleFromTimestamp(unixTimestampSeconds: number): ConnectorUnitLifecycle {
  return inferLifecycleFromDate(new Date(unixTimestampSeconds * 1000))
}

function inferSessionSnapshotState(unixTimestampSeconds: number): SessionSnapshotState {
  const ageMs = Date.now() - unixTimestampSeconds * 1000

  if (ageMs < RECENT_SESSION_WINDOW_MS) {
    return {
      freshness: 'recent',
      lifecycle: 'waiting',
      summary: 'Recent history snapshot from the latest user turn',
    }
  }

  if (ageMs < STALE_SESSION_WINDOW_MS) {
    return {
      freshness: 'stale',
      lifecycle: 'completed',
      summary: 'Historical snapshot with no recent live activity signal',
    }
  }

  return {
    freshness: 'archived',
    lifecycle: 'completed',
    summary: 'Archived history snapshot with no current live activity signal',
  }
}

function inferLifecycleFromDate(value: Date): ConnectorUnitLifecycle {
  const ageMs = Date.now() - value.getTime()

  if (ageMs < 30 * 60 * 1000) {
    return 'running'
  }

  if (ageMs < 12 * 60 * 60 * 1000) {
    return 'waiting'
  }

  return 'completed'
}

function toIsoTimestamp(unixTimestampSeconds: number): string {
  return new Date(unixTimestampSeconds * 1000).toISOString()
}

function dedupeEventSnapshots(events: NormalizedEvent[]): NormalizedEvent[] {
  const deduped = new Map<string, NormalizedEvent>()

  for (const event of events) {
    deduped.set(createEventDeduplicationKey(event), event)
  }

  return [...deduped.values()]
}

function createEventDeduplicationKey(event: NormalizedEvent): string {
  return [
    event.connectorId,
    event.subjectId,
    event.kind,
    event.occurredAt,
    JSON.stringify(event.payload),
  ].join('|')
}

function matchValue(text: string, pattern: RegExp): string | null {
  const match = pattern.exec(text)
  return match?.[1] ?? null
}

function matchBoolean(text: string, pattern: RegExp): boolean | null {
  const value = matchValue(text, pattern)

  if (value === 'true') {
    return true
  }

  if (value === 'false') {
    return false
  }

  return null
}

function matchNumber(text: string, pattern: RegExp): number | null {
  const value = matchValue(text, pattern)
  return value === null ? null : Number(value)
}
