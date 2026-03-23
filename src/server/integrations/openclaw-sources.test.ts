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
    expect(sessions[0]?.name).toBe('Real-Mode Polish Slice for OpenClaw AgentOps...')
    expect(sessions[0]?.metadata.promptPreview).toBe(
      'Implement a focused real-mode polish slice for OpenClaw AgentOps Console based on real environment findings and preserve the fuller operational preview in me...',
    )
    expect(sessions[0]?.metadata.promptLabel).toBe('Real-Mode Polish Slice for OpenClaw AgentOps...')
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

  it('dedupes near-duplicate session started events from the same thread', async () => {
    const config = await createSourcesFixture({
      logLines: [
        '2026-03-22T12:00:00.000Z INFO thread.id=abc123 session_init.is_subagent=false',
        '2026-03-22T12:00:00.000Z INFO thread.id=abc123 session_init.is_subagent=false',
        '2026-03-22T12:00:05.000Z INFO thread.id=abc123 session_init.is_subagent=false',
        '2026-03-22T12:00:30.000Z INFO thread.id=abc123 session_init.is_subagent=false',
        '2026-03-22T12:01:00.000Z INFO thread.id=abc123 codex.op="user_turn" session_init.is_subagent=false',
      ],
    })

    const events = await listOpenClawEventSnapshots(config)

    expect(events).toHaveLength(3)
    expect(events.map((event) => event.kind)).toEqual([
      EventKind.SessionUpdated,
      EventKind.SessionStarted,
      EventKind.SessionStarted,
    ])
    expect(events.map((event) => event.occurredAt)).toEqual([
      '2026-03-22T12:01:00.000Z',
      '2026-03-22T12:00:30.000Z',
      '2026-03-22T12:00:05.000Z',
    ])
    expect(events.every((event) => event.subjectId === 'sessions:abc123')).toBe(true)
  })

  it('collapses repeated user-turn log lines for the same submission and turn into one event', async () => {
    const config = await createSourcesFixture({
      logLines: [
        '2026-03-22T12:01:00.000Z INFO thread.id=abc123 submission.id=sub-001 turn.id=turn-001 codex.op="user_turn" session_init.is_subagent=false',
        '2026-03-22T12:01:02.800Z INFO thread.id=abc123 submission.id=sub-001 turn.id=turn-001 op.dispatch.user_turn session_init.is_subagent=false',
        '2026-03-22T12:01:05.500Z INFO thread.id=abc123 submission.id=sub-001 turn.id=turn-001 codex.op="user_turn" session_init.is_subagent=false',
      ],
    })

    const events = await listOpenClawEventSnapshots(config)

    expect(events).toHaveLength(1)
    expect(events.map((event) => event.kind)).toEqual([
      EventKind.SessionUpdated,
    ])
    expect(events.map((event) => event.occurredAt)).toEqual([
      '2026-03-22T12:01:05.500Z',
    ])
    expect(events.every((event) => event.subjectId === 'sessions:abc123')).toBe(true)
    expect(events[0]?.payload).toMatchObject({
      submissionId: 'sub-001',
      turnId: 'turn-001',
      turnOp: 'user_turn',
    })
  })

  it('keeps distinct session updated events for different turn contexts in the same thread', async () => {
    const config = await createSourcesFixture({
      logLines: [
        '2026-03-22T12:01:00.000Z INFO thread.id=abc123 submission.id=sub-001 turn.id=turn-001 codex.op="user_turn" session_init.is_subagent=false',
        '2026-03-22T12:01:00.700Z INFO thread.id=abc123 submission.id=sub-001 turn.id=turn-001 op.dispatch.user_turn session_init.is_subagent=false',
        '2026-03-22T12:01:04.200Z INFO thread.id=abc123 submission.id=sub-002 turn.id=turn-002 codex.op="user_turn" session_init.is_subagent=false',
      ],
    })

    const events = await listOpenClawEventSnapshots(config)

    expect(events).toHaveLength(2)
    expect(events.map((event) => event.kind)).toEqual([
      EventKind.SessionUpdated,
      EventKind.SessionUpdated,
    ])
    expect(events.map((event) => event.occurredAt)).toEqual([
      '2026-03-22T12:01:04.200Z',
      '2026-03-22T12:01:00.700Z',
    ])
    expect(events.map((event) => event.payload.turnId)).toEqual(['turn-002', 'turn-001'])
  })

  it('cleans canonical REAL-mode thread and turn identifiers before building session subjects', async () => {
    const config = await createSourcesFixture({
      logLines: [
        '2026-03-22T12:01:00.000Z INFO thread.id=real-thread-001,trace_id=trace-999 submission.id=sub-001,span_id=span-111 turn.id=turn-001] codex.op="user_turn" session_init.is_subagent=false',
        '2026-03-22T12:01:02.500Z INFO thread.id=real-thread-001,trace_id=trace-999 submission.id=sub-001,span_id=span-111 turn.id=turn-001] op.dispatch.user_turn session_init.is_subagent=false',
      ],
    })

    const events = await listOpenClawEventSnapshots(config)

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      subjectId: 'sessions:real-thread-001',
      sessionId: 'sessions:real-thread-001',
      payload: {
        submissionId: 'sub-001',
        turnId: 'turn-001',
        turnOp: 'user_turn',
      },
    })
  })

  it('keeps recent turn-context grouping behavior with cleaned REAL-mode identifiers', async () => {
    const config = await createSourcesFixture({
      logLines: [
        '2026-03-22T12:01:00.000Z INFO thread.id=real-thread-001,trace_id=trace-999 submission.id=sub-001,span_id=span-111 turn.id=turn-001] codex.op="user_turn" session_init.is_subagent=false',
        '2026-03-22T12:01:00.700Z INFO thread.id=real-thread-001,trace_id=trace-999 submission.id=sub-001,span_id=span-111 turn.id=turn-001] op.dispatch.user_turn session_init.is_subagent=false',
        '2026-03-22T12:01:04.200Z INFO thread.id=real-thread-001,trace_id=trace-999 submission.id=sub-002,span_id=span-222 turn.id=turn-002] codex.op="user_turn" session_init.is_subagent=false',
      ],
    })

    const events = await listOpenClawEventSnapshots(config)

    expect(events).toHaveLength(2)
    expect(events.map((event) => event.subjectId)).toEqual([
      'sessions:real-thread-001',
      'sessions:real-thread-001',
    ])
    expect(events.map((event) => event.payload.submissionId)).toEqual(['sub-002', 'sub-001'])
    expect(events.map((event) => event.payload.turnId)).toEqual(['turn-002', 'turn-001'])
  })

  it('preserves low-signal REAL-mode operations in payloads for downstream feed classification', async () => {
    const config = await createSourcesFixture({
      logLines: [
        '2026-03-22T12:01:00.000Z INFO thread.id=real-thread-001 codex.op="list_skills" session_init.is_subagent=false',
        '2026-03-22T12:01:01.000Z INFO thread.id=real-thread-001 codex.op="exec_approval" session_init.is_subagent=false',
        '2026-03-22T12:01:02.000Z INFO thread.id=real-thread-001 codex.op="add_to_history" session_init.is_subagent=false',
      ],
    })

    const events = await listOpenClawEventSnapshots(config)

    expect(events).toHaveLength(3)
    expect(events.map((event) => event.payload.turnOp)).toEqual([
      'add_to_history',
      'exec_approval',
      'list_skills',
    ])
    expect(events.map((event) => event.kind)).toEqual([
      EventKind.SessionStarted,
      EventKind.SessionStarted,
      EventKind.SessionStarted,
    ])
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
