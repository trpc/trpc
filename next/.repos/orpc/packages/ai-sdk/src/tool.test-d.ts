import type { InferToolInput, InferToolOutput } from 'ai'
import { asyncIteratorObject, oc } from '@orpc/contract'
import { os } from '@orpc/server'
import { generateText } from 'ai'
import { z } from 'zod'
import { createToolFactory, implementToolFactory } from './tool'

describe('implementToolFactory', () => {
  it('can use as a tool', () => {
    const contract = oc
      .input(z.object({
        location: z.string().describe('The location to get the weather for'),
      }))
      .output(z.object({
        location: z.string(),
        temperature: z.number().describe('The temperature in Fahrenheit'),
      }))

    const weatherTool = implementToolFactory()(contract, {
      execute: async ({ location }) => ({
        location,
        temperature: 72 + Math.floor(Math.random() * 21) - 10,
      }),
    })

    void generateText({
      model: 'openai/gpt-4o',
      tools: {
        weather: weatherTool,
      },
      prompt: 'What is the weather in San Francisco?',
    })
  })

  it('infer correct input & output', () => {
    const contract = oc
      .input(z.object({
        stringToNumber: z.string().transform(val => Number(val)),
      }))
      .output(z.object({
        numberToBoolean: z.number().transform(val => Boolean(val)),
      }))

    const tool = implementToolFactory()(contract, {
      execute: async ({ stringToNumber }) => {
        expectTypeOf(stringToNumber).toEqualTypeOf<number>()

        return {
          numberToBoolean: stringToNumber,
        }
      },
    })

    const tool2 = implementToolFactory()(contract, {
      // @ts-expect-error invalid numberToBoolean
      execute: async ({ stringToNumber }) => {
        return {
          numberToBoolean: true,
        }
      },
    })
  })
})

describe('createToolFactory', () => {
  it('can use as a tool', () => {
    const procedure = os
      .input(z.object({
        location: z.string().describe('The location to get the weather for'),
      }))
      .output(z.object({
        location: z.string(),
        temperature: z.number().describe('The temperature in Fahrenheit'),
      }))
      .handler(async ({ input }) => {
        return {
          location: input.location,
          temperature: 72 + Math.floor(Math.random() * 21) - 10,
        }
      })

    const weatherTool = createToolFactory()(procedure)

    void generateText({
      model: 'openai/gpt-4o',
      tools: {
        weather: weatherTool,
      },
      prompt: 'What is the weather in San Francisco?',
    })
  })

  it('infer correct input & output', () => {
    const procedure = os
      .input(z.object({
        stringToNumber: z.string().transform(val => Number(val)),
      }))
      .output(z.object({
        numberToBoolean: z.number().transform(val => Boolean(val)),
      }))
      .handler(async ({ input }) => {
        return {
          numberToBoolean: input.stringToNumber,
        }
      })

    const tool = createToolFactory()(procedure)

    expectTypeOf<InferToolInput<typeof tool>>().toEqualTypeOf<{ stringToNumber: number }>()
    expectTypeOf<InferToolOutput<typeof tool>>().toEqualTypeOf<{ numberToBoolean: number }>()
  })

  it('execute is managed by the factory', () => {
    const procedure = os
      .input(z.object({
        location: z.string(),
      }))
      .handler(async () => 'output')

    void createToolFactory()(procedure, {
      // @ts-expect-error execute is managed by the factory
      execute: async () => 'output',
    })
  })

  it('require provide initial context if required', () => {
    const procedure = os
      .$context<{ authToken: string }>()
      .input(z.object({
        location: z.string().describe('The location to get the weather for'),
      }))
      .handler(async ({ context, input }) => {})

    void createToolFactory({
      context: { authToken: '' },
    })(procedure)

    // @ts-expect-error missing context
    void createToolFactory()(procedure)

    // @ts-expect-error mismatched context
    void createToolFactory({ context: { other: '' } })(procedure)
  })

  it('does not accept a signal, the AI SDK provides one per tool call', () => {
    // @ts-expect-error signal is not a factory option
    void createToolFactory({ signal: AbortSignal.timeout(1000) })
  })

  it('infer output as yield type for async iterator outputs', () => {
    const procedure = os
      .input(z.object({ location: z.string() }))
      .output(asyncIteratorObject(
        z.object({ status: z.string() }),
        z.object({ url: z.string() }),
      ))
      .handler(async function* () {
        yield { status: 'building' }
        return { url: 'https://example.com' }
      })

    const tool = createToolFactory()(procedure)

    expectTypeOf<InferToolOutput<typeof tool>>().toEqualTypeOf<{ status: string }>()
  })

  it('infer output as yield type for async generator handlers without an output schema', () => {
    const procedure = os
      .input(z.object({ location: z.string() }))
      .handler(async function* () {
        yield { status: 'building' }
        return { url: 'https://example.com' }
      })

    const tool = createToolFactory()(procedure)

    expectTypeOf<InferToolOutput<typeof tool>>().toEqualTypeOf<{ status: string }>()
  })
})
