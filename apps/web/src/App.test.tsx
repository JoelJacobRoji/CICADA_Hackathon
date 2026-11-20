import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

afterEach(() => vi.unstubAllGlobals())

describe('App foundation screen', () => {
  it('labels itself as a foundation build and shows real probe results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => ({ ok: url.includes('9001') }) as Response),
    )
    render(<App />)
    expect(screen.getByText(/foundation build/i)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('status-SaaS API')).toHaveTextContent('ok'))
    expect(screen.getByTestId('status-Collector (local)')).toHaveTextContent('unreachable')
  })
})
