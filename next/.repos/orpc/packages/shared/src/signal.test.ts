import { allAbortSignal, anyAbortSignal, runWithSignal } from './signal'

describe('allAbortSignal', () => {
  it('should return undefined if contains undefined or empty array', () => {
    expect(allAbortSignal([])).toBe(undefined)
    expect(allAbortSignal([undefined])).toBe(undefined)
    expect(allAbortSignal([AbortSignal.timeout(100), undefined])).toBe(undefined)
    expect(allAbortSignal([AbortSignal.timeout(100), undefined, AbortSignal.timeout(100)])).toBe(undefined)
  })

  it('should return a non-aborted signal initially if not all inputs are aborted', () => {
    const controller1 = new AbortController()
    const controller2 = new AbortController()

    expect(allAbortSignal([controller1.signal, controller2.signal])?.aborted).toBe(false)

    controller1.abort()
    expect(allAbortSignal([controller1.signal, controller2.signal])?.aborted).toBe(false)
  })

  it('should return an aborted signal initially if all valid inputs are already aborted', () => {
    const controller1 = new AbortController()
    const controller2 = new AbortController()
    controller1.abort()
    controller2.abort()

    const batchSignal = allAbortSignal([controller1.signal, controller2.signal])
    expect(batchSignal?.aborted).toBe(true)
  })

  it('should fire abort event when all signals abort', () => {
    const controllerPreAborted = new AbortController()
    const controllerLater1 = new AbortController()
    const controllerLater2 = new AbortController()

    controllerPreAborted.abort()

    const batchSignal = allAbortSignal([
      controllerPreAborted.signal,
      controllerLater1.signal,
      controllerLater2.signal,
    ])

    expect(batchSignal?.aborted).toBe(false)

    const abortSpy = vi.fn()
    batchSignal?.addEventListener('abort', abortSpy)

    controllerLater1.abort()
    expect(batchSignal?.aborted).toBe(false)
    expect(abortSpy).not.toHaveBeenCalled()

    controllerLater2.abort()
    expect(batchSignal?.aborted).toBe(true)
    expect(abortSpy).toHaveBeenCalledTimes(1)
  })
})

describe('anyAbortSignal', () => {
  it('should return undefined if empty or contains only undefined', () => {
    expect(anyAbortSignal([])).toBe(undefined)
    expect(anyAbortSignal([undefined])).toBe(undefined)
    expect(anyAbortSignal([undefined, undefined])).toBe(undefined)
  })

  it('should return the signal as-is if only one valid signal is provided', () => {
    const controller = new AbortController()

    expect(anyAbortSignal([controller.signal])).toBe(controller.signal)
    expect(anyAbortSignal([undefined, controller.signal, undefined])).toBe(controller.signal)
  })

  describe.each([
    { mode: 'native', description: 'built-in AbortSignal.any' },
    { mode: 'without-any', description: 'fallback implementation' },
    { mode: 'without-global', description: 'fallback implementation without the AbortSignal global' },
  ] as const)('with $description', ({ mode }) => {
    const originalAny = AbortSignal.any

    beforeEach(() => {
      if (mode === 'without-any') {
        // @ts-expect-error simulate runtimes without AbortSignal.any support
        AbortSignal.any = undefined
      }

      if (mode === 'without-global') {
        // simulate runtimes without the AbortSignal global, such as bare React Native
        vi.stubGlobal('AbortSignal', undefined)
      }
    })

    afterEach(() => {
      vi.unstubAllGlobals()
      AbortSignal.any = originalAny
    })

    it('should return an aborted signal initially if any input is already aborted', () => {
      const reason = new Error('already aborted')
      const controller1 = new AbortController()
      const controller2 = new AbortController()
      controller1.abort(reason)

      const anySignal = anyAbortSignal([controller1.signal, controller2.signal])
      expect(anySignal?.aborted).toBe(true)
      expect(anySignal?.reason).toBe(reason)
    })

    it('should abort with the reason of the first signal that aborts', () => {
      const controller1 = new AbortController()
      const controller2 = new AbortController()

      const anySignal = anyAbortSignal([controller1.signal, controller2.signal])
      expect(anySignal?.aborted).toBe(false)

      const abortSpy = vi.fn()
      anySignal?.addEventListener('abort', abortSpy)

      const reason = new Error('first abort')
      controller2.abort(reason)
      expect(anySignal?.aborted).toBe(true)
      expect(anySignal?.reason).toBe(reason)
      expect(abortSpy).toHaveBeenCalledTimes(1)

      controller1.abort(new Error('second abort'))
      expect(anySignal?.reason).toBe(reason)
    })
  })
})

describe('runWithSignal', () => {
  it('resolves with fn result when no signal provided', async () => {
    const result = await runWithSignal(undefined, async () => 42)
    expect(result).toBe(42)
  })

  it('rejects if fn rejects when no signal provided', async () => {
    await expect(runWithSignal(undefined, async () => {
      throw new Error('fail')
    }))
      .rejects
      .toThrow('fail')
  })

  it('throws immediately if signal already aborted', async () => {
    const controller = new AbortController()
    controller.abort(new Error('already aborted'))

    const fn = vi.fn(async () => 42)
    await expect(runWithSignal(controller.signal, fn)).rejects.toThrow('already aborted')
    expect(fn).not.toHaveBeenCalled()
  })

  it('resolves with fn result when signal not aborted', async () => {
    const controller = new AbortController()
    const result = await runWithSignal(controller.signal, async () => 'success')
    expect(result).toBe('success')
  })

  it('rejects if fn rejects when signal not aborted', async () => {
    const controller = new AbortController()
    await expect(runWithSignal(controller.signal, async () => {
      throw new Error('boom')
    }))
      .rejects
      .toThrow('boom')
  })

  it('rejects when signal aborts before fn resolves', async () => {
    const controller = new AbortController()
    const fn = () => new Promise<number>(resolve => setTimeout(resolve, 1000, 42))

    const promise = runWithSignal(controller.signal, fn)
    controller.abort(new Error('aborted mid-flight'))

    await expect(promise).rejects.toThrow('aborted mid-flight')
  })

  it('resolves if fn resolves before signal aborts', async () => {
    const controller = new AbortController()
    const fn = () => new Promise<number>(resolve => setTimeout(resolve, 10, 42))

    const promise = runWithSignal(controller.signal, fn)
    setTimeout(() => controller.abort(new Error('too late')), 1000)

    await expect(promise).resolves.toBe(42)
  })

  it('removes abort listener after fn resolves', async () => {
    const controller = new AbortController()
    const addSpy = vi.spyOn(controller.signal, 'addEventListener')
    const removeSpy = vi.spyOn(controller.signal, 'removeEventListener')

    await runWithSignal(controller.signal, async () => 'done')

    expect(addSpy).toHaveBeenCalledWith('abort', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('abort', addSpy.mock.calls[0]![1])
  })

  it('removes abort listener after fn rejects', async () => {
    const controller = new AbortController()
    const removeSpy = vi.spyOn(controller.signal, 'removeEventListener')

    await expect(runWithSignal(controller.signal, async () => {
      throw new Error('fail')
    }))
      .rejects
      .toThrow('fail')

    expect(removeSpy).toHaveBeenCalled()
  })
})
