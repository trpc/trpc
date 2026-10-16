import z from 'zod'
import { os } from './builder'
import { call } from './procedure-utils'

describe('call', () => {
  it('requires input, options if context is required', async () => {
    const procedure = os
      .$context<{ auth: boolean }>()
      .handler(() => 'output')

    // @ts-expect-error require input & options
    call(procedure)
    // @ts-expect-error require options
    call(procedure, undefined)

    const output = await call(procedure, undefined, { context: { auth: true } })
    expectTypeOf(output).toEqualTypeOf<string>()
  })

  it('requires input if input is required', async () => {
    const procedure = os
      .input(z.string())
      .handler(() => 'output')

    // @ts-expect-error require input & options
    call(procedure)

    const output = await call(procedure, 'input')
    expectTypeOf(output).toEqualTypeOf<string>()
  })

  it('optional input & context if both is optional', async () => {
    const procedure = os
      .input(z.string().optional())
      .handler(() => 'output')

    const output = await call(procedure)
    expectTypeOf(output).toEqualTypeOf<string>()
  })

  it('infer correct input types', () => {
    const procedure = os
      .input(z.number())
      .handler(() => 'output')

    // @ts-expect-error require input is invalid
    call(procedure, 'invalid')
    call(procedure, 123)
  })

  it('infer correct context types', () => {
    const procedure = os
      .$context<{ auth: boolean }>()
      .handler(() => 'output')

    // @ts-expect-error require input is invalid
    call(procedure, undefined, { context: { auth: 'invalid' } })
    call(procedure, undefined, { context: { auth: true } })
  })
})
