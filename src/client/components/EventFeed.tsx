import { EventKind, type NormalizedEvent } from '../../shared/types'

export function EventFeed(props: { events: NormalizedEvent[] }) {
  if (props.events.length === 0) {
    return (
      <div className="empty-state">
        <h3>No events yet.</h3>
        <p>Recent runtime activity will appear here.</p>
      </div>
    )
  }

  return (
    <ol className="event-feed">
      {props.events.map((event) => (
        <li className="event-card" key={event.id}>
          <div className="event-card__header">
            <span className={`event-kind event-kind--${toEventTone(event.kind)}`}>{event.kind}</span>
            <time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString()}</time>
          </div>
          <div className="event-card__title">{event.subjectId}</div>
          <p className="event-card__detail">{describeEvent(event)}</p>
        </li>
      ))}
    </ol>
  )
}

function describeEvent(event: NormalizedEvent): string {
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

function toEventTone(kind: EventKind): 'info' | 'warning' | 'success' {
  switch (kind) {
    case EventKind.ActionCompleted:
      return 'success'
    case EventKind.ActionRequested:
      return 'warning'
    default:
      return 'info'
  }
}
