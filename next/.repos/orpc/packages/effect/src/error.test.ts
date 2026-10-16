import { ORPCError } from '@orpc/server'
import { Cause, Effect, Exit } from 'effect'
import { catchORPCError, catchORPCErrorCode, catchORPCErrorCodes } from './error'

describe('catchORPCError', () => {
  it('catches any ORPCError failure (data-last)', async () => {
    const handled = Effect.fail(new ORPCError('NOT_FOUND', { data: 'data' })).pipe(
      catchORPCError(error => Effect.succeed(`caught:${error.code}`)),
    )

    await expect(Effect.runPromise(handled)).resolves.toEqual('caught:NOT_FOUND')
  })

  it('catches any ORPCError failure (data-first)', async () => {
    const handled = catchORPCError(
      Effect.fail(new ORPCError('CONFLICT')),
      error => Effect.succeed(`caught:${error.code}`),
    )

    await expect(Effect.runPromise(handled)).resolves.toEqual('caught:CONFLICT')
  })

  it('does not catch non-ORPCError failures', async () => {
    const error = new Error('__TEST__')
    const handler = vi.fn(() => Effect.succeed('caught'))

    const exit = await Effect.runPromiseExit(catchORPCError(Effect.fail(error), handler))

    expect(exit).toEqual(Exit.fail(error))
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not catch defects', async () => {
    const error = new ORPCError('NOT_FOUND')
    const handler = vi.fn(() => Effect.succeed('caught'))

    const exit = await Effect.runPromiseExit(catchORPCError(Effect.die(error), handler))

    expect(exit).toEqual(Exit.failCause(Cause.die(error)))
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not touch successful effects', async () => {
    const handler = vi.fn(() => Effect.succeed('caught'))

    await expect(Effect.runPromise(catchORPCError(Effect.succeed('output'), handler))).resolves.toEqual('output')
    expect(handler).not.toHaveBeenCalled()
  })

  it('can fail again inside the handler', async () => {
    const error = new Error('__TEST__')

    const exit = await Effect.runPromiseExit(
      Effect.fail(new ORPCError('NOT_FOUND')).pipe(
        catchORPCError(() => Effect.fail(error)),
      ),
    )

    expect(exit).toEqual(Exit.fail(error))
  })
})

describe('catchORPCErrorCode', () => {
  it('catches ORPCError failures with a matching code (data-last)', async () => {
    const handled = Effect.fail(new ORPCError('NOT_FOUND', { data: 'data' })).pipe(
      catchORPCErrorCode('NOT_FOUND', error => Effect.succeed(`caught:${error.data}`)),
    )

    await expect(Effect.runPromise(handled)).resolves.toEqual('caught:data')
  })

  it('catches ORPCError failures with a matching code (data-first)', async () => {
    const handled = catchORPCErrorCode(
      Effect.fail(new ORPCError('CONFLICT', { data: 'data' })),
      'CONFLICT',
      error => Effect.succeed(`caught:${error.data}`),
    )

    await expect(Effect.runPromise(handled)).resolves.toEqual('caught:data')
  })

  it('does not catch ORPCError failures with a different code', async () => {
    const error = new ORPCError('CONFLICT') as ORPCError<'CONFLICT', undefined> | ORPCError<'NOT_FOUND', undefined>
    const handler = vi.fn(() => Effect.succeed('caught'))

    const exit = await Effect.runPromiseExit(
      catchORPCErrorCode(Effect.fail(error), 'NOT_FOUND', handler),
    )

    expect(exit).toEqual(Exit.fail(error))
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not catch non-ORPCError failures, even with a matching code property', async () => {
    const error = Object.assign(new Error('__TEST__'), { code: 'NOT_FOUND' }) as Error | ORPCError<'NOT_FOUND', undefined>
    const handler = vi.fn(() => Effect.succeed('caught'))

    const exit = await Effect.runPromiseExit(
      catchORPCErrorCode(Effect.fail(error), 'NOT_FOUND', handler),
    )

    expect(exit).toEqual(Exit.fail(error))
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not touch successful effects', async () => {
    const handler = vi.fn(() => Effect.succeed('caught'))
    const effect = Effect.succeed('output') as Effect.Effect<string, ORPCError<'NOT_FOUND', undefined>>

    await expect(
      Effect.runPromise(catchORPCErrorCode(effect, 'NOT_FOUND', handler)),
    ).resolves.toEqual('output')
    expect(handler).not.toHaveBeenCalled()
  })

  it('can fail again inside the handler', async () => {
    const error = new Error('__TEST__')

    const exit = await Effect.runPromiseExit(
      Effect.fail(new ORPCError('NOT_FOUND')).pipe(
        catchORPCErrorCode('NOT_FOUND', () => Effect.fail(error)),
      ),
    )

    expect(exit).toEqual(Exit.fail(error))
  })
})

describe('catchORPCErrorCodes', () => {
  it('catches ORPCError failures with the matching handler (data-last)', async () => {
    const conflictHandler = vi.fn(() => Effect.succeed('caught:conflict'))
    const error = new ORPCError('NOT_FOUND', { data: 'data' }) as ORPCError<'NOT_FOUND', string> | ORPCError<'CONFLICT', undefined>

    const handled = Effect.fail(error).pipe(
      catchORPCErrorCodes({
        NOT_FOUND: error => Effect.succeed(`caught:${error.data}`),
        CONFLICT: conflictHandler,
      }),
    )

    await expect(Effect.runPromise(handled)).resolves.toEqual('caught:data')
    expect(conflictHandler).not.toHaveBeenCalled()
  })

  it('catches ORPCError failures with the matching handler (data-first)', async () => {
    const handled = catchORPCErrorCodes(
      Effect.fail(new ORPCError('CONFLICT', { data: 'data' })),
      { CONFLICT: error => Effect.succeed(`caught:${error.data}`) },
    )

    await expect(Effect.runPromise(handled)).resolves.toEqual('caught:data')
  })

  it('does not catch ORPCError failures without a matching handler', async () => {
    const error = new ORPCError('CONFLICT') as ORPCError<'CONFLICT', undefined> | ORPCError<'NOT_FOUND', undefined>
    const handler = vi.fn(() => Effect.succeed('caught'))

    const exit = await Effect.runPromiseExit(
      catchORPCErrorCodes(Effect.fail(error), { NOT_FOUND: handler }),
    )

    expect(exit).toEqual(Exit.fail(error))
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not catch ORPCError failures whose handler is undefined', async () => {
    const error = new ORPCError('NOT_FOUND')

    const exit = await Effect.runPromiseExit(
      catchORPCErrorCodes(Effect.fail(error), { NOT_FOUND: undefined }),
    )

    expect(exit).toEqual(Exit.fail(error))
  })

  it('does not catch non-ORPCError failures, even with a matching code property', async () => {
    const error = Object.assign(new Error('__TEST__'), { code: 'NOT_FOUND' }) as Error | ORPCError<'NOT_FOUND', undefined>
    const handler = vi.fn(() => Effect.succeed('caught'))

    const exit = await Effect.runPromiseExit(
      catchORPCErrorCodes(Effect.fail(error), { NOT_FOUND: handler }),
    )

    expect(exit).toEqual(Exit.fail(error))
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not touch successful effects', async () => {
    const handler = vi.fn(() => Effect.succeed('caught'))
    const effect = Effect.succeed('output') as Effect.Effect<string, ORPCError<'NOT_FOUND', undefined>>

    await expect(
      Effect.runPromise(catchORPCErrorCodes(effect, { NOT_FOUND: handler })),
    ).resolves.toEqual('output')
    expect(handler).not.toHaveBeenCalled()
  })

  it('can fail again inside a handler', async () => {
    const error = new Error('__TEST__')

    const exit = await Effect.runPromiseExit(
      Effect.fail(new ORPCError('NOT_FOUND')).pipe(
        catchORPCErrorCodes({ NOT_FOUND: () => Effect.fail(error) }),
      ),
    )

    expect(exit).toEqual(Exit.fail(error))
  })

  it('does not resolve error codes through Object.prototype', async () => {
    const error = new ORPCError('toString')
    const exit = await Effect.runPromiseExit(
      catchORPCErrorCodes(Effect.fail(error), {} as any) as Effect.Effect<unknown, unknown>,
    )

    expect(exit).toEqual(Exit.fail(error))
  })
})
