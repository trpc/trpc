import { describe, expect, it } from 'vitest'
import { createLoggerStorage } from './node'

describe('createLoggerStorage', () => {
  it('exposes useLogger backed by the storage', () => {
    const { storage, useLogger } = createLoggerStorage()
    const logger = { set: () => {} } as any

    storage!.run(logger, () => {
      expect(useLogger()).toBe(logger)
    })

    expect(() => useLogger()).toThrow(
      'please configure EvlogHandlerPlugin for your handler using the created storage',
    )
  })
})
