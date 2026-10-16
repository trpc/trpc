import { os } from '@orpc/server'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { z } from 'zod'
import { createServerFunction } from '../server-function'
import { useOptimisticServerFunction } from './optimistic-server-function'

export const inputSchema = z.object({ input: z.number().transform(n => `${n}`) })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useOptimisticServerFunction', () => {
  const handler = vi.fn(async ({ input }) => {
    return { output: Number(input?.input ?? 0) }
  })

  const fn = createServerFunction(
    os
      .input(inputSchema)
      .handler(handler),
  )

  it.each(['success', 'error'])('on %s', async (scenario) => {
    if (scenario === 'error') {
      handler.mockRejectedValueOnce(new Error('Test error'))
    }

    const { result } = renderHook(() => {
      const [outputs, setOutputs] = useState(() => [{ output: 0 }])
      const state = useOptimisticServerFunction(fn, {
        optimisticPassthrough: outputs,
        optimisticReducer(state, input) {
          return [...state, { output: Number(input?.input ?? 0) }]
        },
      })

      return { state, setOutputs }
    })

    act(() => {
      result.current.state.execute({ input: 123 })
    })

    expect(result.current.state.optimisticState).toEqual([{ output: 0 }, { output: 123 }])

    await waitFor(() => expect(result.current.state.status).toBe(scenario))

    expect(result.current.state.optimisticState).toEqual([{ output: 0 }])

    act(() => {
      result.current.setOutputs(prev => [...prev, { output: 123 }])
    })

    expect(result.current.state.optimisticState).toEqual([{ output: 0 }, { output: 123 }])
  })
})
