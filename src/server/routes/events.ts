import { Router } from 'express'

import { EventKind, type NormalizedEvent } from '../../shared/types'

type EventPresentationPriority = 'important' | 'normal' | 'noisy'

const NOISY_OPERATION_NAMES = new Set([
  'add_to_history',
  'exec_approval',
  'list_custom_prompts',
  'list_skills',
  'load_history',
  'read_custom_prompt',
  'read_history',
])

export function createEventsRouter(input: {
  listEvents: () => NormalizedEvent[]
}): Router {
  const router = Router()

  router.get('/', (request, response) => {
    const limitParam = request.query.limit
    const limit =
      typeof limitParam === 'string' && Number.isFinite(Number(limitParam))
        ? Math.max(Number(limitParam), 0)
        : null
    const events = input.listEvents().map(shapeEventForFeed)

    response.json({
      data: limit === null ? events : events.slice(0, limit),
    })
  })

  return router
}

export function shapeEventForFeed(event: NormalizedEvent): NormalizedEvent {
  const presentation = classifyEventPresentation(event)

  return {
    ...event,
    payload: {
      ...event.payload,
      presentationPriority: presentation.priority,
      presentationSummary: presentation.summary,
    },
  }
}

function classifyEventPresentation(event: NormalizedEvent): {
  priority: EventPresentationPriority
  summary: string
} {
  const subject = event.subjectId
  const turnOp = readPayloadString(event, 'turnOp')
  const action = readPayloadString(event, 'action')
  const status = readPayloadString(event, 'status')
  const lifecycle = readPayloadString(event, 'lifecycle')
  const unitType = readPayloadString(event, 'unitType')

  if (hasImportantSignal(event)) {
    if (event.kind === EventKind.ActionRequested) {
      return {
        priority: 'important',
        summary: `Operator action ${action ?? 'unknown'} requested for ${subject}.`,
      }
    }

    if (event.kind === EventKind.ActionCompleted) {
      return {
        priority: 'important',
        summary: `Operator action ${action ?? 'unknown'} finished with status ${status ?? 'unknown'}.`,
      }
    }

    if (event.kind === EventKind.AgentRegistered) {
      return {
        priority: 'important',
        summary: `${unitType ?? 'unit'} registered with lifecycle ${lifecycle ?? 'unknown'}.`,
      }
    }

    if (turnOp === 'user_turn') {
      return {
        priority: 'important',
        summary: `User turn received for ${subject}.`,
      }
    }

    return {
      priority: 'important',
      summary: `${subject} emitted an operator-relevant runtime event.`,
    }
  }

  if (turnOp !== null && isNoisyOperation(turnOp)) {
    return {
      priority: 'noisy',
      summary: `Internal runtime step ${formatOperationName(turnOp)}.`,
    }
  }

  if (event.kind === EventKind.AgentUpdated) {
    return {
      priority: 'normal',
      summary: `${subject} reported a runtime update.`,
    }
  }

  if (event.kind === EventKind.SessionStarted) {
    return {
      priority: 'normal',
      summary: `${subject} session started.`,
    }
  }

  if (event.kind === EventKind.SessionUpdated) {
    return {
      priority: 'normal',
      summary:
        turnOp === null
          ? `${subject} session updated.`
          : `${subject} processed ${formatOperationName(turnOp)}.`,
    }
  }

  return {
    priority: 'normal',
    summary: `${subject} emitted an event.`,
  }
}

function hasImportantSignal(event: NormalizedEvent): boolean {
  const action = readPayloadString(event, 'action')
  const status = readPayloadString(event, 'status')
  const turnOp = readPayloadString(event, 'turnOp')
  const payloadText = JSON.stringify(event.payload).toLowerCase()

  return (
    event.kind === EventKind.ActionRequested ||
    event.kind === EventKind.ActionCompleted ||
    event.kind === EventKind.AgentRegistered ||
    turnOp === 'user_turn' ||
    matchesImportantKeyword(action) ||
    matchesImportantKeyword(status) ||
    matchesImportantKeyword(turnOp) ||
    matchesImportantKeyword(payloadText)
  )
}

function isNoisyOperation(turnOp: string): boolean {
  return NOISY_OPERATION_NAMES.has(turnOp.toLowerCase())
}

function matchesImportantKeyword(value: string | null): boolean {
  if (!value) {
    return false
  }

  return /(fallback|fail|error|reject|interrupt|retry)/i.test(value)
}

function formatOperationName(value: string): string {
  return value.replace(/[._-]+/g, ' ').trim()
}

function readPayloadString(event: NormalizedEvent, key: string): string | null {
  const value = event.payload[key]
  return typeof value === 'string' ? value : null
}
