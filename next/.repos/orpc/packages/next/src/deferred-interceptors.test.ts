import { intercept } from '@orpc/shared'
import { onErrorDeferred, onFinishDeferred, onStartDeferred, onSuccessDeferred } from './deferred-interceptors'

describe('onStartDeferred/onSuccessDeferred/onErrorDeferred/onFinishDeferred', async () => {
  it('on success', async () => {
    const callback = vi.fn()
    const output = await intercept([
      onFinishDeferred(callback),
      onStartDeferred(callback),
      onSuccessDeferred(callback),
      onErrorDeferred(callback),
    ], {
      context: true,
    }, async () => {
      return 'test'
    })

    expect(output).toBe('test')
    expect(callback).toHaveBeenCalledTimes(0)

    await new Promise(resolve => setTimeout(resolve, 6))
    expect(callback).toHaveBeenCalledTimes(3)
    expect(callback).toHaveBeenNthCalledWith(1, expect.objectContaining({
      context: true,
    }))
    expect(callback).toHaveBeenNthCalledWith(2, 'test', expect.objectContaining({
      context: true,
    }))
    expect(callback).toHaveBeenNthCalledWith(3, [null, 'test', true], expect.objectContaining({
      context: true,
    }))
  })

  it('on error', async () => {
    const callback = vi.fn()
    await expect(intercept([
      onFinishDeferred(callback),
      onStartDeferred(callback),
      onSuccessDeferred(callback),
      onErrorDeferred(callback),
    ], {
      context: true,
    }, async () => {
      throw new Error('test')
    })).rejects.toThrow('test')

    expect(callback).toHaveBeenCalledTimes(0)

    await new Promise(resolve => setTimeout(resolve, 6))
    expect(callback).toHaveBeenCalledTimes(3)
    expect(callback).toHaveBeenNthCalledWith(1, expect.objectContaining({
      context: true,
    }))
    expect(callback).toHaveBeenNthCalledWith(2, new Error('test'), expect.objectContaining({
      context: true,
    }))
    expect(callback).toHaveBeenNthCalledWith(3, [new Error('test'), undefined, false], expect.objectContaining({
      context: true,
    }))
  })
})
