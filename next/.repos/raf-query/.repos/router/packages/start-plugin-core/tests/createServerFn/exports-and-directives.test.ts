import { describe, expect, test } from 'vitest'
import {
  callProvider,
  compileAll,
  compileCode,
  compileFor,
  evaluateModule,
  importSources,
} from '../regression-helpers'

// Callers keep the module's exports, with each server fn replaced by an RPC;
// the provider module only exports the extracted handlers. Module directives,
// ids and module formats must survive both rewrites.

const head = `import { createServerFn } from '@tanstack/react-start'\n`

/** `functionName -> functionId` of the server fns a compilation reported. */
function idsByName(serverFns: Record<string, { functionName: string }>) {
  return Object.fromEntries(
    Object.entries(serverFns).map(([id, fn]) => [fn.functionName, id]),
  )
}

describe('export forms', () => {
  // Source: Next.js server-actions fixtures server-graph/9, /12, /13, /29,
  // /66, /69, client-graph/4, /15
  test('callers keep every export form and the provider exports only the handlers', async () => {
    const compiled =
      await compileAll(`${head}const a = createServerFn().handler(async () => 'a')
const b = createServerFn().handler(async () => 'b')
const c = createServerFn().handler(async () => 'c')
export const d = createServerFn().handler(async () => 'd'),
  notAServerFn = 1
export let e = createServerFn().handler(async () => 'e')
export var f = createServerFn().handler(async () => 'f')
export { a as default, b as '📙', c as as }`)
    const ids = idsByName(compiled.serverFns)
    const exported = {
      default: 'a',
      '📙': 'b',
      as: 'c',
      d: 'd',
      e: 'e',
      f: 'f',
    }
    for (const [output, rpc] of [
      ['client', 'client'],
      ['ssr', 'ssr'],
    ] as const) {
      const module = await evaluateModule(compiled[output])
      expect({ ...module }).toEqual({
        notAServerFn: 1,
        ...Object.fromEntries(
          Object.entries(exported).map(([name, local]) => [
            name,
            { rpc: { [rpc]: ids[`${local}_createServerFn_handler`] } },
          ]),
        ),
      })
    }
    const provider = await evaluateModule(compiled.provider)
    const locals = ['a', 'b', 'c', 'd', 'e', 'f']
    expect(Object.keys(provider).sort()).toEqual(
      locals.map((local) => `${local}_createServerFn_handler`),
    )
    for (const local of locals) {
      expect(await callProvider(provider, local)).toBe(local)
    }
  })

  // Source: Next.js server-actions fixtures client-graph/1, server-graph/10, /11, /15
  test.each([
    `export default async function () {\n  return fn()\n}`,
    `export default class {\n  call() {\n    return fn()\n  }\n}`,
  ])('an anonymous default export next to a server fn: %s', async (code) => {
    const { client, provider } = await compileAll(
      `${head}export const fn = createServerFn().handler(async () => 1)\n${code}`,
    )
    expect((await evaluateModule(client)).default).toBeTypeOf('function')
    expect(await callProvider(provider, 'fn')).toBe(1)
  })

  // Source: @vitejs/plugin-rsc source-map/wrap-export/local-export-before-declaration.js
  test('an export list before the server fn declaration', async () => {
    const compiled = await compileAll(`${head}export { fn, fn as alias }
const fn = createServerFn().handler(async () => 'fn')`)
    const client = await evaluateModule(compiled.client)
    expect(client.alias).toBe(client.fn)
    expect(client.fn.rpc).toHaveProperty('client')
    expect(await callProvider(compiled.provider, 'fn')).toBe('fn')
  })

  // Source: @vitejs/plugin-rsc source-map/wrap-export/dependent-declarators.js
  test('a server fn built from a sibling declarator', async () => {
    const compiled = await compileAll(`${head}import { db } from './db.server'
export const base = createServerFn(), fn = base.handler(async () => db.x())`)
    expect(importSources(compiled.client)).toEqual([])
    expect(
      await callProvider(compiled.provider, 'fn', {
        './db.server': `export const db = { x: () => 'x' }`,
      }),
    ).toBe('x')
  })

  // Source: @vitejs/plugin-rsc wrap-export.test.ts "re-export simple",
  // "re-export rename", "re-export all simple", "re-export all rename"
  test('re-exports stay in the callers', async () => {
    const compiled = await compileAll(`${head}export { x } from './dep'
export { x as y } from './dep'
export * from './star'
export * as ns from './dep'
export const fn = createServerFn().handler(async () => 'fn')`)
    const stubs = {
      './dep': `export const x = 'x'`,
      './star': `export const starred = 'starred'`,
    }
    for (const caller of [compiled.client, compiled.ssr]) {
      const module = await evaluateModule(caller, stubs)
      expect(Object.keys(module).sort()).toEqual([
        'fn',
        'ns',
        'starred',
        'x',
        'y',
      ])
      expect([module.x, module.y, module.starred, module.ns.x]).toEqual([
        'x',
        'x',
        'starred',
        'x',
      ])
    }
    expect(await callProvider(compiled.provider, 'fn', stubs)).toBe('fn')
  })

  // JSON modules only load with their `type: 'json'` attribute.
  // Source: @vitejs/plugin-rsc source-map/wrap-export/reexport-attributes.js;
  // Turbopack tree-shaker analyzer/import-with-clause
  test('import attributes are kept on the imports and re-exports each output keeps', async () => {
    const compiled =
      await compileAll(`${head}import config from './config.json' with { type: 'json' }
import secrets from './secrets.json' with { type: 'json' }
export { default as data } from './data.json' with { type: 'json' }
export const theme = config.theme
export const fn = createServerFn().handler(async () => secrets.key)`)
    const stubs = {
      './config.json': `{ "theme": "dark" }`,
      './data.json': `{ "data": true }`,
      './secrets.json': `{ "key": "s3cret" }`,
    }
    for (const caller of [compiled.client, compiled.ssr]) {
      expect(importSources(caller)).toEqual(['./config.json', './data.json'])
      const module = await evaluateModule(caller, stubs)
      expect([module.theme, module.data]).toEqual(['dark', { data: true }])
    }
    expect(await callProvider(compiled.provider, 'fn', stubs)).toBe('s3cret')
  })

  // Source: Next.js server-actions fixtures server-graph/60, /62, /68, /72
  test('TypeScript-only exports and an enum next to a server fn', async () => {
    const { provider } =
      await compileAll(`${head}import type { Stuff } from './stuff'
export type X = string
export { type A } from './a'
export type { B } from './b'
export type * from './c'
export type { Foo }
type Foo = string
export interface I {}
export enum E {
  A = 'a',
}
export declare const declared: number
export default interface D {}
export const fn = createServerFn().handler(async (): Promise<Stuff | string> => E.A)`)
    expect(await callProvider(provider, 'fn')).toBe('a')
  })

  // Source: Next.js server-actions fixtures client-graph/2
  test('side-effect imports and top-level statements stay in every output', async () => {
    const compiled = await compileAll(`${head}import './polyfill'
console.log('side-effect-marker')
export const fn = createServerFn().handler(async () => 'fn')`)
    for (const output of [compiled.client, compiled.ssr, compiled.provider]) {
      expect(importSources(output)).toEqual(['./polyfill'])
      expect(output).toContain('side-effect-marker')
    }
  })

  test('redeclared var server fns get distinct versioned handler names', async () => {
    const code = `${head}var fn = createServerFn().handler(async () => 1)
var fn = createServerFn().handler(async () => 2)
export { fn }`
    const { serverFns } = await compileFor('client', code)
    const names = ['fn_createServerFn_handler', 'fn_createServerFn_handler_1']
    expect(Object.keys(idsByName(serverFns)).sort()).toEqual(names)
    const provider = await evaluateModule(
      (await compileCode('provider', code))!,
    )
    expect(Object.keys(provider).sort()).toEqual(names)
  })
})

describe('directives', () => {
  // Source: Next.js server-actions fixtures server-graph/8
  test('handler directives stay in the provider', async () => {
    const { provider } =
      await compileAll(`${head}export const fn = createServerFn().handler(async function () {
  'use strict'
  'use server'
  return 1
})`)
    expect(provider).toMatch(/(["'])use strict\1;?\s*(["'])use server\2/)
    expect(await callProvider(provider, 'fn')).toBe(1)
  })

  // Source: Next.js server-actions fixtures server-graph/3, /4;
  // @vitejs/plugin-rsc utils.test.ts "recognizes directive prologues"
  test.each([
    { prologue: `'use client'\n`, directives: ['use client'] },
    { prologue: `// app/send.ts\n'use server'\n`, directives: ['use server'] },
    {
      prologue: `'use strict'\n'use client'\n`,
      directives: ['use strict', 'use client'],
    },
  ])(
    'module directives stay first in the callers: $directives',
    async ({ prologue, directives }) => {
      const code = `${prologue}${head}export const fn = createServerFn().handler(async () => 1)`
      const prologuePattern = new RegExp(
        String.raw`^(?:\s*//[^\n]*\n)*` +
          directives
            .map((directive) => String.raw`\s*['"]${directive}['"];?`)
            .join(''),
      )
      for (const output of ['client', 'ssr'] as const) {
        expect(await compileCode(output, code)).toMatch(prologuePattern)
      }
    },
  )

  // `serverFnProviderModuleDirectives` start the provider's prologue once,
  // ahead of the generated imports.
  // Source: @vitejs/plugin-rsc utils.test.ts "recognizes directive prologues"
  test.each([`'use server'\n`, `'use strict'\n'use server'\n`])(
    'a provider whose prologue already has the configured directive keeps one: %j',
    async (prologue) => {
      const provider = await compileCode(
        'provider',
        `${prologue}${head}export const fn = createServerFn().handler(async () => 1)`,
        { directives: ['use server', '', 'use server'] },
      )
      expect(provider).toMatch(
        /^(?:\s*(["'])use strict\1;?)?\s*(["'])use server\2/,
      )
      expect(provider!.match(/["']use server["']/g)).toHaveLength(1)
    },
  )

  test.each([`import './setup'\n'use server'\n`, `('use server')\n`])(
    'a "use server" string outside the prologue is not the configured directive: %j',
    async (prologue) => {
      const provider = await compileCode(
        'provider',
        `${prologue}${head}export const fn = createServerFn().handler(async () => 1)`,
        { directives: ['use server'] },
      )
      expect(provider).toMatch(/^\s*(["'])use server\1/)
    },
  )
})

describe('server function ids', () => {
  const decodeDevId = (id: string) =>
    JSON.parse(Buffer.from(id, 'base64url').toString('utf8'))

  test('dev ids encode the provider module and the handler export', async () => {
    const { serverFns } = await compileFor(
      'client',
      `${head}export const getPosts = createServerFn().handler(async () => [])`,
      { mode: 'dev' },
    )
    expect(Object.keys(serverFns).map(decodeDevId)).toEqual([
      {
        file: '/@id/src/module.tsx?tss-serverfn-split',
        export: 'getPosts_createServerFn_handler',
      },
    ])
  })

  test('dev providers export the handler and accept HMR updates', async () => {
    const provider = await compileCode(
      'provider',
      `${head}export const getPosts = createServerFn().handler(async () => 'posts')`,
      { mode: 'dev' },
    )
    expect(provider).toContain('import.meta.hot.accept(')
    expect(provider).toContain('import.meta.webpackHot.accept(')
    expect(await callProvider(provider!, 'getPosts')).toBe('posts')
  })

  /** `functionName -> functionId` of the server fns in `code`. */
  async function idsOf(
    code: string,
    options: Parameters<typeof compileFor>[2] = {},
  ) {
    return idsByName(
      (await compileFor('client', `${head}${code}`, options)).serverFns,
    )
  }

  // Source: SolidStart compile.spec.ts "keeps ids of existing functions when a
  // function is added above them", "keeps production ids stable ..."
  test.each(['build', 'dev'] as const)(
    '%s: ids of existing server fns survive adding one above them',
    async (mode) => {
      const existing = `export const load = createServerFn().handler(async () => 1)
export const save = createServerFn().handler(async () => 2)`
      const before = await idsOf(existing, { mode })
      const after = await idsOf(
        `export const added = createServerFn().handler(async () => 0)\n${existing}`,
        { mode },
      )
      expect(Object.keys(after)).toHaveLength(3)
      expect(after).toMatchObject(before)
    },
  )

  // Source: SolidStart compile.spec.ts "does not ship source names in production ids"
  test('build ids do not ship source names', async () => {
    const [id] = Object.values(
      await idsOf(
        `export const loadSecretReport = createServerFn().handler(async () => 1)`,
      ),
    )
    for (const text of [
      id!,
      Buffer.from(id!, 'base64url').toString('latin1'),
    ]) {
      expect(text).not.toMatch(/loadSecretReport|module|src/)
    }
  })

  // Source: SolidStart compile.spec.ts "tells apart two functions that share a
  // name", "keeps client and server ids aligned"
  test('server fns that share a name in different files get distinct ids the provider uses', async () => {
    const code = `${head}export const load = createServerFn().handler(async () => 1)`
    const ids: Array<string> = []
    for (const id of ['/test/src/a.tsx', '/test/src/b/a.tsx']) {
      const [functionId] = Object.keys(
        (await compileFor('client', code, { id })).serverFns,
      )
      const provider = await evaluateModule(
        (await compileCode('provider', code, { id }))!,
      )
      expect(provider.load_createServerFn_handler.meta.id).toBe(functionId)
      ids.push(functionId!)
    }
    expect(new Set(ids).size).toBe(2)
  })

  // Source: Next.js server-actions fixtures server-graph/66, client-graph/15
  test('non-ASCII and symbol-like server fn names', async () => {
    const names = ['ñandú', '𝑓', 'ᾩ', '$', '_', '$fn']
    const compiled = await compileAll(
      head +
        names
          .map(
            (name) =>
              `export const ${name} = createServerFn().handler(async () => '${name}')`,
          )
          .join('\n'),
    )
    expect(Object.keys(idsByName(compiled.serverFns)).sort()).toEqual(
      names.map((name) => `${name}_createServerFn_handler`).sort(),
    )
    const provider = await evaluateModule(compiled.provider)
    for (const name of names) {
      expect(provider[`${name}_createServerFn_handler`].meta.name).toBe(name)
      expect(await callProvider(provider, name)).toBe(name)
    }
  })
})

describe('module formats', () => {
  // The provider appends its exports after the last statement.
  // Source: Waku vite-plugin-allow-server.test.ts "transforms with trailing
  // comment without new lines"
  test.each([
    { end: '\n// trailing', mode: 'build' },
    { end: '\r\n// trailing', mode: 'build' },
    { end: '\n// trailing', mode: 'dev' },
  ] as const)(
    '$mode: a provider for a module ending in a line comment without a newline: $end',
    async ({ end, mode }) => {
      const provider = await compileCode(
        'provider',
        `${head}export const fn = createServerFn().handler(async () => 'handler')${end}`,
        { mode },
      )
      expect(await callProvider(provider!, 'fn')).toBe('handler')
    },
  )

  // .cts/.mts sources are TypeScript without JSX.
  // Source: @vitejs/plugin-rsc cjs.test.ts (fixtures/cjs)
  test.each(['/test/src/fn.cts', '/test/src/fn.mts'])(
    '%s may use angle-bracket type assertions',
    async (id) => {
      const { code, serverFns } = await compileFor(
        'client',
        `${head}import { db } from './db.server'
const n = <number>(1 as unknown)
export const fn = createServerFn().handler(async () => [n, db.x()])`,
        { id },
      )
      expect(Object.keys(serverFns)).toHaveLength(1)
      expect(importSources(code!)).toEqual([])
    },
  )
})
