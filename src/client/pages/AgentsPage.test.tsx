import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import '../test/server'
import { AgentsPage } from './AgentsPage'

describe('AgentsPage', () => {
  it('renders agents and supports search and filter controls', async () => {
    const user = userEvent.setup()

    render(<AgentsPage />)

    expect(await screen.findByRole('heading', { name: 'Unit inventory' })).toBeInTheDocument()
    expect(screen.getByText('planner')).toBeInTheDocument()
    expect(screen.getByText('writer')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Search agents'), 'writer')
    await waitFor(() => {
      expect(screen.queryByText('planner')).not.toBeInTheDocument()
    })
    expect(screen.getByText('writer')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Search agents'))
    await user.selectOptions(screen.getByLabelText('Filter by health'), 'anomaly')

    await waitFor(() => {
      expect(screen.queryByText('incident-triage')).not.toBeInTheDocument()
    })
    expect(screen.getByText('writer')).toBeInTheDocument()
    expect(screen.getByText('Read-only')).toBeInTheDocument()
  })
})
