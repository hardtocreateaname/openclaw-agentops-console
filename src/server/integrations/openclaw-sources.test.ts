import os from 'node:os'
import path from 'node:path'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'

import { describe, expect, it, afterEach, vi } from 'vitest'

import { EventKind } from '../../shared/types'
import {
  listOpenClawEventSnapshots,
  listOpenClawSessions,
  type OpenClawSourcesConfig,
} from './openclaw-sources'

const tempDirs: string[] = []

describe('openclaw sources', () => {
  afterEach(async () => {
    vi.useRealTimers()

    await Promise.all(tempDirs.splice(0).map((tempDir) => rm(tempDir, { recursive: true, force: true })))
  })

  it('generates compact session labels while preserving a fuller preview', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-22T12:00:00.000Z'))

    const config = await createSourcesFixture({
      historyLines: [
        JSON.stringify({
          session_id: 'sess-compact',
          ts: Date.parse('2026-03-22T11:58:00.000Z') / 1000,
          text:
            'Implement a focused real-mode polish slice for OpenClaw AgentOps Console based on real environment findings and preserve the fuller operational preview in metadata.',
        }),
      ],
    })

    const sessions = await listOpenClawSessions(config)

    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.name).toBe('Implement a focused real-mode polish slice fo...')
    expect(sessions[0]?.metadata.promptPreview).toBe(
      'Implement a focused real-mode polish slice for OpenClaw AgentOps Console based on real environment findings and preserve the fuller operational preview in me...',
    )
    expect(sessions[0]?.metadata.promptLabel).toBe(
      'Implement a focused real-mode polish slice fo...',
    )
    expect(sessions[0]?.metadata.snapshotFreshness).toBe('recent')
  })

  it('marks older history snapshots as completed and archived', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-22T12:00:00.000Z'))

    const config = await createSourcesFixture({
      historyLines: [
        JSON.stringify({
          session_id: 'sess-archived',
          ts: Date.parse('2026-03-22T02:00:00.000Z') / 1000,
          text: 'Review the archived session state.',
        }),
      ],
    })

    const sessions = await listOpenClawSessions(config)

    expect(sessions[0]?.lifecycle).toBe('completed')
    expect(sessions[0]?.metadata.snapshotFreshness).toBe('archived')
    expect(sessions[0]?.metadata.snapshotSummary).toBe(
      'Archived history snapshot with no current live activity signal',
    )
  })

  it('dedupes repeated event snapshots with the same semantic payload', async () => {
    const repeatedLine =
      '2026-03-22T12:00:00.000Z INFO thread.id=abc123 codex.op="user_turn" session_init.is_subagent=false'
    const config = await createSourcesFixture({
      logLines: [
        repeatedLine,
        repeatedLine,
        '2026-03-22T12:01:00.000Z INFO thread.id=abc123 codex.op="user_turn" session_init.is_subagent=false',
        '2026-03-22T12:02:00.000Z INFO thread.id=def456 session_init.is_subagent=true',
      ],
    })

    const events = await listOpenClawEventSnapshots(config)

    expect(events).toHaveLength(3)
    expect(events.map((event) => event.kind)).toEqual([
      EventKind.SessionStarted,
      EventKind.SessionUpdated,
      EventKind.SessionUpdated,
    ])
    expect(events.filter((event) => event.subjectId === 'sessions:abc123')).toHaveLength(2)
  })
})

async function createSourcesFixture(input: {
  historyLines?: string[]
  logLines?: string[]
}): Promise<OpenClawSourcesConfig> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'openclaw-sources-'))
  const historyPath = path.join(tempDir, 'history.jsonl')
  const logDir = path.join(tempDir, 'log')
  const tuiLogPath = path.join(logDir, 'codex-tui.log')
  const versionPath = path.join(tempDir, 'version.json')

  tempDirs.push(tempDir)

  await mkdir(logDir, { recursive: true })
  await writeFile(historyPath, `${(input.historyLines ?? []).join('\n')}\n`, 'utf8')
  await writeFile(tuiLogPath, `${(input.logLines ?? []).join('\n')}\n`, 'utf8')
  await writeFile(versionPath, JSON.stringify({ latest_version: '0.0.0-test' }), 'utf8')

  return {
    historyPath,
    tuiLogPath,
    versionPath,
  }
}
