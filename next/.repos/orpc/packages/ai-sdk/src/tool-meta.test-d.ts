import { asyncIteratorObject, oc } from '@orpc/contract'
import { os } from '@orpc/server'
import { z } from 'zod'
import { aiSdkTool } from './tool-meta'

describe('aiSdkTool meta', () => {
  it('infer input and output types from the contract', () => {
    oc
      .input(z.object({ location: z.string() }))
      .output(z.object({ temperature: z.number() }))
      .meta(aiSdkTool({
        inputExamples: [{ input: { location: 'Hanoi' } }],
        onInputAvailable: ({ input }) => {
          expectTypeOf(input).toEqualTypeOf<{ location: string }>()
        },
        toModelOutput: ({ input, output }) => {
          expectTypeOf(input).toEqualTypeOf<{ location: string }>()
          expectTypeOf(output).toEqualTypeOf<{ temperature: number }>()

          return { type: 'text', value: `${output.temperature}` }
        },
      }))

    oc
      .input(z.object({ location: z.string() }))
      .meta(aiSdkTool({
        // @ts-expect-error invalid input example
        inputExamples: [{ input: { location: 42 } }],
      }))
  })

  it('infer output as yield type for async iterator outputs', () => {
    os
      .input(z.object({ location: z.string() }))
      .output(asyncIteratorObject(z.object({ status: z.string() })))
      .meta(aiSdkTool({
        toModelOutput: ({ output }) => {
          expectTypeOf(output).toEqualTypeOf<{ status: string }>()

          return { type: 'text', value: output.status }
        },
      }))
  })
})
