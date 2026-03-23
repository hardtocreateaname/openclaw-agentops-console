import { useState } from 'react'

import { EventKind, type JsonValue, type NormalizedEvent } from '../../shared/types'

export function EventFeed(props: { events: NormalizedEvent[] }) {
  const [showNoisyEvents, setShowNoisyEvents] = useState(false)

  if (props.events.length === 0) {
    return (
      <div className="empty-state">
        <h3>No events yet.</h3>
        <p>Recent runtime activity will appear here.</p>
      </div>
    )
  }

  const visibleEvents = props.events.filter((event) => getPresentationPriority(event) !== 'noisy')
  const noisyEvents = props.events.filter((event) => getPresentationPriority(event) === 'noisy')
  const renderedEvents = showNoisyEvents ? props.events : visibleEvents

  return (
    <div>
      {noisyEvents.length > 0 ? (
        <div className="event-feed__toolbar">
          <p className="event-feed__summary">
            {showNoisyEvents
              ? `Showing ${noisyEvents.length} noisy internal events.`
              : `Hiding ${noisyEvents.length} noisy internal events by default.`}
          </p>
          <button
            className="event-feed__toggle"
            type="button"
            onClick={() => setShowNoisyEvents((value) => !value)}
          >
            {showNoisyEvents ? 'Hide noisy events' : `Show ${noisyEvents.length} noisy events`}
          </button>
        </div>
      ) : null}
      <ol className="event-feed">
        {renderedEvents.map((event) => (
          <li
            className={`event-card${getPresentationPriority(event) === 'noisy' ? ' event-card--noisy' : ''}`}
            key={event.id}
          >
            <div className="event-card__header">
              <span className={`event-kind event-kind--${toEventTone(event)}`}>{getPresentationPriority(event)}</span>
              <time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString()}</time>
            </div>
            <div className="event-card__title">{event.subjectId}</div>
            <p className="event-card__detail">{describeEvent(event)}</p>
            <p className="event-card__meta">{event.kind}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}

function describeEvent(event: NormalizedEvent): string {
  const presentedSummary = readPayloadString(event.payload.presentationSummary)

  if (presentedSummary) {
    return presentedSummary
  }

  switch (event.kind) {
    case EventKind.AgentRegistered:
      return `${event.payload.unitType ?? 'unit'} registered with lifecycle ${event.payload.lifecycle ?? 'unknown'}.`
    case EventKind.AgentUpdated:
      return `${event.subjectId} reported a runtime update.`
    case EventKind.ActionRequested:
      return `Control action ${String(event.payload.action ?? 'unknown')} was requested.`
    case EventKind.ActionCompleted:
      return `Control action ${String(event.payload.action ?? 'unknown')} finished with status ${String(event.payload.status ?? 'unknown')}.`
    case EventKind.SessionStarted:
      return `${event.subjectId} session started.`
    case EventKind.SessionUpdated:
      return `${event.subjectId} session updated.`
    default:
      return `${event.subjectId} emitted an event.`
  }
}

function toEventTone(event: NormalizedEvent): 'info' | 'warning' | 'success' {
  if (event.kind === EventKind.ActionCompleted) {
    return 'success'
  }

  if (getPresentationPriority(event) === 'important' || event.kind === EventKind.ActionRequested) {
    return 'warning'
  }

  return 'info'
}

function getPresentationPriority(event: NormalizedEvent): 'important' | 'normal' | 'noisy' {
  const value = readPayloadString(event.payload.presentationPriority)

  if (value === 'important' || value === 'normal' || value === 'noisy') {
    return value
  }

  return 'normal'
}

function readPayloadString(value: JsonValue | undefined): string | null {
  return typeof value === 'string' ? value : null
}
