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
const SESSION_STARTED_DEDUPE_WINDOW_MS = 10 * 1000
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
  submissionId: string | null
  turnId: string | null
  eventKind: EventKind
  turnOp: string | null
  logicalGroupKey: string | null
  isSubagent: boolean | null
  enabledMcpServerCount: number | null
  requiredMcpServerCount: number | null
  line: string
}

interface EventSnapshotCandidate {
  event: NormalizedEvent
  logicalGroupKey: string | null
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

      return {
        event: {
          id: `openclaw-log:${line.threadId}:${index}:${line.eventKind}`,
          kind: line.eventKind,
          connectorId: 'sessions',
          subjectId,
          sessionId: subjectId,
          agentId: null,
          occurredAt: line.occurredAt,
          payload: {
            sourceKind: 'codex-log',
            isSubagent: line.isSubagent ?? false,
            submissionId: line.submissionId,
            turnId: line.turnId,
            turnOp: line.turnOp,
          },
        },
        logicalGroupKey: line.logicalGroupKey,
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

  const threadId = matchCanonicalLogId(line, /thread(?:_id|\.id)=(?:"([^"]+)"|([^\s]+))/i)
  const submissionId = matchCanonicalLogId(line, /submission(?:_id|\.id)=(?:"([^"]+)"|([^\s]+))/i)
  const turnId = matchCanonicalLogId(line, /turn(?:_id|\.id)=(?:"([^"]+)"|([^\s]+))/i)
  const turnOp = matchTurnOperation(line)

  return {
    occurredAt: timestampMatch[1],
    threadId,
    submissionId,
    turnId,
    eventKind: inferEventKind(turnOp),
    turnOp,
    logicalGroupKey: createLogicalGroupKey(threadId, submissionId, turnId, turnOp),
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
  const clause =
    sentence.split(/\b(?:while|with|based on|using|from)\b/i, 1)[0]?.split(/[;:]/, 1)[0] ?? sentence
  const compact = clause.replace(/\s+/g, ' ').trim()
  const labelSource = compact || normalized

  return truncateText(formatPromptAsTitle(labelSource), SESSION_LABEL_MAX_CHARS)
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

function dedupeEventSnapshots(events: EventSnapshotCandidate[]): NormalizedEvent[] {
  const deduped: NormalizedEvent[] = []
  const exactEventIndexes = new Map<string, number>()
  const recentSessionStartedIndexes = new Map<string, number>()
  const logicalSessionUpdatedIndexes = new Map<string, number>()

  for (const candidate of events) {
    const { event, logicalGroupKey } = candidate
    const exactKey = createEventDeduplicationKey(event)
    const exactIndex = exactEventIndexes.get(exactKey)

    if (exactIndex !== undefined) {
      deduped[exactIndex] = event
      continue
    }

    if (event.kind === EventKind.SessionStarted) {
      const recentKey = createSessionStartedDeduplicationKey(event)
      const recentIndex = recentSessionStartedIndexes.get(recentKey)

      if (recentIndex !== undefined) {
        const previousEvent = deduped[recentIndex]
        const previousOccurredAt = previousEvent ? Date.parse(previousEvent.occurredAt) : Number.NaN
        const currentOccurredAt = Date.parse(event.occurredAt)

        if (
          Number.isFinite(previousOccurredAt) &&
          Number.isFinite(currentOccurredAt) &&
          currentOccurredAt - previousOccurredAt <= SESSION_STARTED_DEDUPE_WINDOW_MS
        ) {
          exactEventIndexes.delete(createEventDeduplicationKey(previousEvent))
          deduped[recentIndex] = event
          exactEventIndexes.set(exactKey, recentIndex)
          continue
        }
      }

      recentSessionStartedIndexes.set(recentKey, deduped.length)
    }

    if (event.kind === EventKind.SessionUpdated && logicalGroupKey !== null) {
      const logicalIndex = logicalSessionUpdatedIndexes.get(logicalGroupKey)

      if (logicalIndex !== undefined) {
        const previousEvent = deduped[logicalIndex]

        if (previousEvent) {
          exactEventIndexes.delete(createEventDeduplicationKey(previousEvent))
        }

        deduped[logicalIndex] = event
        exactEventIndexes.set(exactKey, logicalIndex)
        continue
      }

      logicalSessionUpdatedIndexes.set(logicalGroupKey, deduped.length)
    }

    exactEventIndexes.set(exactKey, deduped.length)
    deduped.push(event)
  }

  return deduped
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

function createSessionStartedDeduplicationKey(event: NormalizedEvent): string {
  return [event.connectorId, event.subjectId, JSON.stringify(event.payload)].join('|')
}

function inferEventKind(turnOp: string | null): EventKind {
  return turnOp === 'user_turn' ? EventKind.SessionUpdated : EventKind.SessionStarted
}

function matchTurnOperation(line: string): string | null {
  const codexOp = matchValue(line, /codex\.op=(?:"([^"]+)"|([^\s]+))/i)

  if (codexOp !== null) {
    return codexOp
  }

  const dispatchOp = matchValue(line, /op\.dispatch\.([a-z0-9_.-]+)/i)

  if (dispatchOp !== null) {
    return dispatchOp
  }

  return null
}

function createLogicalGroupKey(
  threadId: string | null,
  submissionId: string | null,
  turnId: string | null,
  turnOp: string | null,
): string | null {
  if (threadId === null || turnOp !== 'user_turn') {
    return null
  }

  if (submissionId === null && turnId === null) {
    return null
  }

  return [
    `thread:${threadId}`,
    `submission:${submissionId ?? 'none'}`,
    `turn:${turnId ?? 'none'}`,
    `op:${turnOp}`,
  ].join('|')
}

function formatPromptAsTitle(text: string): string {
  const words = text
    .replace(/^[`"'([{]+/, '')
    .replace(/[`"')\]}]+$/, '')
    .split(/\s+/)
    .filter((word) => word.length > 0)

  const trimmedWords = trimLeadingTitleNoise(words)

  if (trimmedWords.length === 0) {
    return 'OpenClaw session'
  }

  return trimmedWords.map((word, index) => toTitleWord(word, index, trimmedWords.length)).join(' ')
}

function trimLeadingTitleNoise(words: string[]): string[] {
  const leadingImperatives = new Set([
    'add',
    'build',
    'create',
    'debug',
    'fix',
    'implement',
    'investigate',
    'make',
    'polish',
    'refactor',
    'review',
    'update',
    'write',
  ])
  const leadingQualifiers = new Set([
    'a',
    'an',
    'the',
    'focused',
    'small',
    'narrow',
    'very',
    'follow-up',
    'followup',
    'quick',
    'concise',
    'targeted',
  ])

  let startIndex = 0

  if (words[0] && leadingImperatives.has(words[0].toLowerCase())) {
    startIndex = 1
  }

  while (words[startIndex] && leadingQualifiers.has(words[startIndex].toLowerCase())) {
    startIndex += 1
  }

  return words.slice(startIndex)
}

function toTitleWord(word: string, index: number, totalWords: number): string {
  const lowerCasedWord = word.toLowerCase()
  const smallWords = new Set(['a', 'an', 'and', 'as', 'at', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with'])

  if (/[A-Z]{2,}/.test(word) || /[a-z][A-Z]/.test(word)) {
    return word
  }

  if (smallWords.has(lowerCasedWord) && index > 0 && index < totalWords - 1) {
    return lowerCasedWord
  }

  return lowerCasedWord.replace(/(^|[-_/])([a-z])/g, (match, prefix: string, character: string) => {
    return `${prefix}${character.toUpperCase()}`
  })
}

function matchValue(text: string, pattern: RegExp): string | null {
  const match = pattern.exec(text)

  if (!match) {
    return null
  }

  for (let index = 1; index < match.length; index += 1) {
    const value = match[index]

    if (value !== undefined) {
      return value
    }
  }

  return null
}

function matchCanonicalLogId(text: string, pattern: RegExp): string | null {
  const value = matchValue(text, pattern)

  if (value === null) {
    return null
  }

  const canonicalIdMatch = /^[A-Za-z0-9][A-Za-z0-9._:-]*/.exec(value)
  return canonicalIdMatch?.[0] ?? null
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
