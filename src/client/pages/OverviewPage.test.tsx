import { render, screen, within } from '@testing-library/react'

import '../test/server'
import { OverviewPage } from './OverviewPage'

describe('OverviewPage', () => {
  it('renders summary metrics, high-risk coverage, and recent events', async () => {
    render(<OverviewPage />)

    expect(await screen.findByText('Operational posture at a glance')).toBeInTheDocument()
    expect(screen.getByText('High-risk units')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()

    const attentionSection = screen.getByRole('heading', { name: 'High-risk agents' }).closest('section')
    expect(within(attentionSection ?? document.body).getByText('writer')).toBeInTheDocument()
    expect(
      within(attentionSection ?? document.body).getByText(/configured latency threshold/i),
    ).toBeInTheDocument()

    expect(screen.getByText('Latest events')).toBeInTheDocument()
    expect(screen.getByText('subagents:subagent-001')).toBeInTheDocument()
    expect(screen.getByText(/finished with status completed/i)).toBeInTheDocument()
  })
})
