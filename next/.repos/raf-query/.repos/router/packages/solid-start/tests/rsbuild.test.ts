// @vitest-environment node
import { createRsbuild } from '@rsbuild/core'
import { describe, expect, test, vi } from 'vitest'
import { tanstackStart } from '../src/plugin/rsbuild'

// Exercise the Solid-specific hook with Rsbuild's real chain, independently of
// route generation and the core Start plugin's filesystem setup.
vi.mock('@tanstack/start-plugin-core/rsbuild', () => ({
  RSBUILD_ENVIRONMENT_NAMES: { server: 'server' },
  tanStackStartRsbuild: () => ({ setup() {} }),
}))

async function configureBabel(
  target: 'web' | 'node',
  options: string | { presets: Array<unknown> },
) {
  const results: Array<unknown> = []
  const rsbuild = await createRsbuild({
    rsbuildConfig: {
      source: { entry: { index: './src/index.ts' } },
      output: { target },
      plugins: [
        {
          name: 'test-babel-options',
          setup(api) {
            api.modifyBundlerChain((chain, { CHAIN_ID }) => {
              for (const id of [
                CHAIN_ID.RULE.JS,
                CHAIN_ID.RULE.JS_DATA_URI,
                'babel-js',
              ]) {
                chain.module
                  .rule(id)
                  .use(CHAIN_ID.USE.BABEL)
                  .loader('babel-loader')
                  .options(structuredClone(options))
              }
            })
          },
        },
        tanstackStart(),
        {
          name: 'test-read-babel-options',
          setup(api) {
            api.modifyBundlerChain((chain, { CHAIN_ID }) => {
              for (const id of [
                CHAIN_ID.RULE.JS,
                CHAIN_ID.RULE.JS_DATA_URI,
                'babel-js',
              ]) {
                results.push(
                  chain.module.rule(id).use(CHAIN_ID.USE.BABEL).get('options'),
                )
              }
            })
          },
        },
      ],
    },
  })
  await rsbuild.initConfigs()
  return results
}

describe('Solid Start Rsbuild Babel options', () => {
  test.each(['web', 'node'] as const)(
    'preserves string loader options for %s',
    async (target) => {
      const options = 'babelrc=true&configFile=./babel.config.json'
      expect(await configureBabel(target, options)).toEqual([
        options,
        options,
        options,
      ])
    },
  )

  test.each(['web', 'node'] as const)(
    'retains Solid hydration and target selection for %s',
    async (target) => {
      const options = {
        presets: [
          ['babel-preset-solid', { custom: true, hydratable: false }],
          ['another-preset', { untouched: true }],
        ],
      }
      const expected = {
        presets: [
          [
            'babel-preset-solid',
            {
              custom: true,
              hydratable: true,
              generate: target === 'node' ? 'ssr' : 'dom',
            },
          ],
          ['another-preset', { untouched: true }],
        ],
      }
      expect(await configureBabel(target, options)).toEqual([
        expected,
        expected,
        expected,
      ])
    },
  )
})
