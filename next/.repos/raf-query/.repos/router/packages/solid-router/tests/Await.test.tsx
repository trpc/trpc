import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@solidjs/testing-library'
import { Await } from '../src/awaited'

afterEach(cleanup)

describe('Await', () => {
  it.each([
    ['zero', 0],
    ['false', false],
    ['empty string', ''],
    ['null', null],
    ['undefined', undefined],
  ])('renders a resolved %s value', async (_name, value) => {
    const children = vi.fn(() => <span>resolved</span>)

    render(() => (
      <Await promise={Promise.resolve(value)} fallback={<span>pending</span>}>
        {children}
      </Await>
    ))

    await waitFor(() => {
      expect(children).toHaveBeenCalledOnce()
    })
    expect(children).toHaveBeenCalledWith(value)
  })
})
