import { afterEach, describe, expect, test, vi } from 'vitest'
import { createLinkPerformanceConfig } from './config'

afterEach(() => vi.unstubAllEnvs())

describe.each(['client', 'ssr'] as const)('%s configuration', (target) => {
  test('discovers only the requested suite', () => {
    const config = createLinkPerformanceConfig(target)
    expect(config.test?.benchmark?.include).toEqual([`${target}.bench.ts`])
  })

  test('builds production code for the correct environment', () => {
    const config = createLinkPerformanceConfig(target)
    expect(config.define?.['process.env.NODE_ENV']).toBe('"production"')
    expect(config.resolve?.conditions).toContain(
      target === 'ssr' ? 'node' : 'browser',
    )
    expect(config.build?.ssr).toBe(target === 'ssr')
    expect(config.build?.outDir).toBe(`./dist/${target}`)
    expect(config.build?.rolldownOptions?.platform).toBe('node')
    expect(config.build?.rolldownOptions?.external).toEqual([
      'node:module',
      'module',
      /^react(?:\/|$)/,
      /^react-dom(?:\/|$)/,
    ])
  })

  test('does not retransform built bundles in the test environment', () => {
    vi.stubEnv('VITEST', 'true')
    const config = createLinkPerformanceConfig(target)
    expect(config.ssr?.noExternal).toBeUndefined()
    expect(config.test?.server?.deps?.external).toEqual([
      /\/link-performance\/dist\//,
    ])
  })

  test('bundles router dependencies when building app snapshots', () => {
    vi.stubEnv('VITEST', undefined)
    expect(createLinkPerformanceConfig(target).ssr?.noExternal).toBe(true)
  })
})
