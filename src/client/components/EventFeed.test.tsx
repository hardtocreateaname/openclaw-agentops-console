import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { EventKind, type NormalizedEvent } from '../../shared/types'
import { EventFeed } from './EventFeed'

describe('EventFeed', () => {
  it('hides noisy events by default and reveals them on demand', async () => {
    const user = userEvent.setup()

    render(
      <EventFeed
        events={[
          createEvent('important', EventKind.SessionUpdated, {
            presentationPriority: 'important',
            presentationSummary: 'User turn received for sessions:thread-001.',
          }),
          createEvent('noisy', EventKind.SessionUpdated, {
            presentationPriority: 'noisy',
            presentationSummary: 'Internal runtime step list skills.',
          }),
        ]}
      />,
    )

    expect(screen.getByText('User turn received for sessions:thread-001.')).toBeInTheDocument()
    expect(screen.getByText('Show 1 noisy events')).toBeInTheDocument()
    expect(screen.queryByText('Internal runtime step list skills.')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show 1 noisy events' }))

    expect(screen.getByText('Internal runtime step list skills.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide noisy events' })).toBeInTheDocument()
  })
})

function createEvent(
  id: string,
  kind: NormalizedEvent['kind'],
  payload: NormalizedEvent['payload'],
): NormalizedEvent {
  return {
    id,
    kind,
    connectorId: 'sessions',
    subjectId: 'sessions:thread-001',
    sessionId: 'sessions:thread-001',
    agentId: null,
    occurredAt: '2026-03-22T12:00:00.000Z',
    payload,
  }
}
