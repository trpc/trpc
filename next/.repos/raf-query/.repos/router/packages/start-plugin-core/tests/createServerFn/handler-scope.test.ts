import { expect, test } from 'vitest'
import {
  callProvider,
  compileAll,
  compileCode,
  evaluateModule,
  importSources,
} from '../regression-helpers'

// The provider module runs the extracted handler: it must keep every module
// binding the handler closes over, however the handler is written and
// however its scopes shadow module names.

const head = `import { createServerFn } from '@tanstack/react-start'\n`
const dbServer = `export const db = { x: () => 'x', y: () => 'y' }`

// Source: Next.js server-actions fixtures server-graph/5, /6, /16
test('the provider keeps every kind of module binding the handler reads', async () => {
  const { client, provider } =
    await compileAll(`${head}import * as ns from './ns'
var counter = 4
class Repo {
  static get() {
    return 'repo'
  }
}
enum Role {
  Admin = 'admin',
}
export const fn = createServerFn().handler(async () => [ns.x, counter, Repo.get(), Role.Admin])`)
  expect(importSources(client)).toEqual([])
  expect(
    await callProvider(provider, 'fn', { './ns': `export const x = 'ns'` }),
  ).toEqual(['ns', 4, 'repo', 'admin'])
})

test.each<{
  name: string
  code: string
  expected: unknown
  read?: (value: any) => Promise<unknown>
}>([
  {
    // Source: Next.js server-actions fixtures server-graph/7, /44
    name: 'a named function expression',
    code: `export const fn = createServerFn().handler(async function deleteItem() {
  return deleteItem.name + db.x()
})`,
    expected: 'deleteItemx',
  },
  {
    // Source: Next.js server-actions fixtures server-graph/59
    name: 'a function using this, arguments and new.target',
    code: `export const fn = createServerFn().handler(async function (this: unknown) {
  return [typeof this, arguments.length, new.target === undefined, db.x()]
})`,
    expected: ['undefined', 1, true, 'x'],
  },
  {
    // Source: Next.js server-actions fixtures server-graph/14 (streaming)
    name: 'an async generator',
    code: `export const fn = createServerFn().handler(async function* () {
  yield db.x()
  yield 'done'
})`,
    read: async (iterator: AsyncIterable<unknown>) => {
      const values: Array<unknown> = []
      for await (const value of iterator) {
        values.push(value)
      }
      return values
    },
    expected: ['x', 'done'],
  },
  {
    // Source: Next.js server-actions fixtures server-graph/31
    name: 'an object literal method',
    code: `export const fn = createServerFn().handler({
  async f() {
    return db.x()
  },
}.f)`,
    expected: 'x',
  },
  {
    // Source: Next.js server-actions fixtures server-graph/21, /26
    name: 'a wrapper call',
    code: `import { withAuth } from './auth.server'
export const fn = createServerFn().handler(withAuth(async () => db.x()))`,
    expected: 'auth:x',
  },
  {
    // Source: Next.js server-actions fixtures server-graph/25
    name: 'a function declared after the server fn',
    code: `export const fn = createServerFn().handler(impl)
async function impl() {
  return inner()
  async function inner() {
    return db.x()
  }
}`,
    expected: 'x',
  },
  {
    // Source: Next.js server-actions fixtures server-graph/28, /30
    name: 'a call of a server fn declared later',
    code: `export const fn = createServerFn().handler(async () => (await later()) + db.x())
export const later = createServerFn().handler(async () => 'later:')`,
    expected: 'later:x',
  },
  {
    name: 'a parenthesized non-null initializer',
    code: `export const fn = (createServerFn().handler(async () => db.x()))!`,
    expected: 'x',
  },
])(
  'the handler can be $name',
  async ({ code, expected, read = async (value) => value }) => {
    const compiled = await compileAll(
      `${head}import { db } from './db.server'\n${code}`,
    )
    for (const caller of [compiled.client, compiled.ssr]) {
      expect(importSources(caller)).toEqual([])
    }
    const value = await callProvider(compiled.provider, 'fn', {
      './db.server': dbServer,
      './auth.server': `export const withAuth = (fn) => async (opts) => 'auth:' + (await fn(opts))`,
    })
    expect(await read(value)).toEqual(expected)
  },
)

// Each handler reads the module binding `value` (or `key`) through a scope
// that also declares, or seems to declare, the same name.
test.each<{ name: string; code: string; data?: unknown; expected: unknown }>([
  {
    // Source: @vitejs/plugin-rsc hoist/function-hoist-block.js (block-level
    // functions are block scoped in modules)
    name: 'past a function declared in a nested block',
    code: `const value = 'outer'
export const fn = createServerFn().handler(async () => {
  const seen = value
  {
    function value() {}
  }
  return seen
})`,
    expected: 'outer',
  },
  {
    // Source: @vitejs/plugin-rsc hoist/catch-binding-shadow.js
    name: 'past a catch parameter of the same name',
    code: `const value = { message: 'outer' }
export const fn = createServerFn().handler(async () => {
  const readOuter = () => value.message
  try {
    throw new Error('inner')
  } catch (value) {
    return [value.message, readOuter()]
  }
})`,
    expected: ['inner', 'outer'],
  },
  {
    // Source: @vitejs/plugin-rsc hoist/class-declaration-in-body.js
    name: 'from a class declared in the handler',
    code: `const value = 'outer'
export const fn = createServerFn().handler(async () => {
  class Helper {
    run() {
      return value
    }
  }
  return new Helper().run()
})`,
    expected: 'outer',
  },
  {
    // Source: @vitejs/plugin-rsc hoist/computed-destructuring-key-captures-outer-binding.js
    name: 'through a computed destructuring key',
    code: `const key = 'value'
export const fn = createServerFn().handler(async ({ data }) => {
  const { [key]: picked } = data
  return picked
})`,
    data: { value: 'picked' },
    expected: 'picked',
  },
  {
    // Source: @vitejs/plugin-rsc hoist/destructured-param-default-bound.js
    name: 'from a destructured parameter default',
    code: `const value = 'outer'
export const fn = createServerFn().handler(async ({ data: { x = value } = {} }) => x)`,
    expected: 'outer',
  },
  {
    // Source: @vitejs/plugin-rsc scope/param-default-var-hoisting.js
    // (parameter defaults do not see var declarations of the body)
    name: 'from a parameter default next to a var of the same name',
    code: `const value = 'outer'
export const fn = createServerFn().handler(async ({ data = value }) => {
  var value = 'inner'
  return [data, value]
})`,
    expected: ['outer', 'inner'],
  },
  {
    // Source: @vitejs/plugin-rsc hoist/shadow-partial-if-block-over-outer-local.js
    name: 'past a block that shadows it in one branch',
    code: `const value = 'outer'
export const fn = createServerFn().handler(async () => {
  const pick = (flag: boolean) => {
    if (flag) {
      const value = 'inner'
      return value
    }
    return value
  }
  return [pick(true), pick(false)]
})`,
    expected: ['inner', 'outer'],
  },
  {
    // Source: @vitejs/plugin-rsc scope/let-const-block.js;
    // typescript-eslint class/declaration/static-block.js
    name: 'next to loop, switch and static block locals of the same name',
    code: `const value = 'outer'
export const fn = createServerFn().handler(async ({ data }) => {
  const out = []
  for (let value = 0; value < 1; value++) out.push(value)
  switch (data) {
    case 1: {
      const value = 'case'
      out.push(value)
    }
    default:
      out.push(value)
  }
  class Block {
    static read
    static {
      Block.read = value
    }
  }
  out.push(Block.read)
  return out
})`,
    data: 1,
    expected: [0, 'case', 'outer', 'outer'],
  },
  {
    // Source: @vitejs/plugin-rsc hoist/self-ref-inner-shadow.js
    name: 'next to an inner function expression named like the server fn',
    code: `const value = 1
export const fn = createServerFn().handler(async ({ data }) => {
  const result = (function fn(m) {
    return m > 0 ? fn(m - 1) : 0
  })(data)
  return value + result
})`,
    data: 3,
    expected: 1,
  },
  {
    // Source: @vitejs/plugin-rsc hoist/methods.js
    name: 'as computed method names',
    code: `const key = 'computed'
export const fn = createServerFn().handler(async () => {
  const api = { async [key]() {} }
  class Actions {
    static async [key]() {
      return 'static'
    }
  }
  return [Object.keys(api), await Actions[key]()]
})`,
    expected: [['computed'], 'static'],
  },
  {
    // Source: @vitejs/plugin-rsc scope/label.js (labels are not references)
    name: 'next to a label of the same name',
    code: `const value = 'outer'
export const fn = createServerFn().handler(async () => {
  value: for (const item of [1, 2]) {
    if (item) {
      break value
    }
  }
  return value
})`,
    expected: 'outer',
  },
  {
    // Source: React Compiler fixtures (tagged templates)
    name: 'as a template tag',
    code: `const value = (strings: TemplateStringsArray, n: number) => strings[0] + n
export const fn = createServerFn().handler(async () => value\`id-\${1}\`)`,
    expected: 'id-1',
  },
  {
    // Source: React Compiler fixtures (shorthand properties)
    name: 'as a shorthand property',
    code: `const value = 'outer'
export const fn = createServerFn().handler(async () => ({ value }))`,
    expected: { value: 'outer' },
  },
])(
  'the provider keeps a module binding the handler reads $name',
  async ({ code, data, expected }) => {
    const provider = await compileCode('provider', `${head}${code}`)
    expect(await callProvider(provider!, 'fn', {}, data)).toEqual(expected)
  },
)

// Source: @vitejs/plugin-rsc hoist/self-ref-nested-function.js,
// hoist/direct-recursion-self-binding.js
test('a handler can call its own server fn', async () => {
  const provider = await compileCode(
    'provider',
    `${head}export const fn = createServerFn().handler(async ({ data }) =>
  data > 0 ? fn({ data: data - 1 }) : 'done')`,
  )
  expect(await callProvider(provider!, 'fn', {}, 2)).toBe('done')
})

// Source: @vitejs/plugin-rsc hoist/captured-local-assignment.js,
// wrap-export.test.ts "preserve reference"
test('a handler and client code can both update an exported let', async () => {
  const compiled = await compileAll(`${head}export let count = 0
export function changeCount() {
  count += 1
  return count
}
export const bump = createServerFn().handler(async () => ++count)`)
  const client = await evaluateModule(compiled.client)
  expect(client.changeCount()).toBe(1)
  expect(client.count).toBe(1)
  const provider = await evaluateModule(compiled.provider)
  expect(await callProvider(provider, 'bump')).toBe(1)
  expect(await callProvider(provider, 'bump')).toBe(2)
})

// Source: Next.js server-actions fixtures server-graph/27
test('exported helpers the handler uses stay declared in the provider', async () => {
  const { provider } = await compileAll(`${head}import { db } from './db.server'
export async function load() {
  return db.x()
}
export default function helper() {
  return db.y()
}
export class Repo {
  static z() {
    return 'z'
  }
}
const local = () => 'w'
export { local as alias }
export const fn = createServerFn().handler(async () => [await load(), helper(), Repo.z(), local()])`)
  expect(
    await callProvider(provider, 'fn', { './db.server': dbServer }),
  ).toEqual(['x', 'y', 'z', 'w'])
})
