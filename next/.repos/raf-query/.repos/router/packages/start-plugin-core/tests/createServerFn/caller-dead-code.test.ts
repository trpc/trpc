import { describe, expect, test } from 'vitest'
import {
  callProvider,
  compileAll,
  compileCode,
  evaluateModule,
  importSources,
} from '../regression-helpers'
import { declarationOf, getModuleErrors } from '../validate-module'
import type { ModuleStub } from '../regression-helpers'

// Client and SSR callers replace a server fn handler with an RPC, then drop
// the module code only the handler read, so server-only imports never reach
// them. Code the callers still read must survive with its values.

const head = `import { createServerFn } from '@tanstack/react-start'\n`
const dbServer = `export const db = { x: () => 'x' }`

describe('callers drop a server import only the handler reads', () => {
  // Source: Next.js server-actions fixtures server-graph/6 (shadowed bindings)
  test.each([
    {
      name: 'a handler local shadows an import the client uses',
      code: `import { db } from './db.server'
import { format } from './format'
export const label = format('x')
export const fn = createServerFn().handler(async () => {
  const format = (value: unknown) => \`local:\${value}\`
  return format(db.x())
})`,
      client: ['./format'],
      provider: ['./db.server'],
      expected: 'local:x',
    },
    {
      name: 'a handler parameter shadows an import the client uses',
      code: `import { db } from './db.server'
export const fn = createServerFn().handler(async ({ data: db }: { data: string }) => db)
export const clientDb = db`,
      client: ['./db.server'],
      provider: [],
      expected: 'param',
    },
  ])('when $name', async ({ code, client, provider, expected }) => {
    const compiled = await compileAll(`${head}${code}`)
    expect(importSources(compiled.client)).toEqual(client)
    expect(importSources(compiled.provider)).toEqual(provider)
    expect(
      await callProvider(
        compiled.provider,
        'fn',
        { './db.server': dbServer },
        'param',
      ),
    ).toBe(expected)
  })

  // Each snippet uses the name `db` in a position that is not a reference to
  // the import the handler reads.
  test.each<{
    name: string
    code: string
    stubs?: Record<string, ModuleStub>
    check?: (client: Record<string, any>) => void
  }>([
    {
      // Source: @vitejs/plugin-rsc scope/label.js
      name: 'a label',
      code: `export function loop() {
  db: for (const item of [1, 2]) {
    if (item) {
      break db
    }
  }
  return 'loop'
}`,
      check: (client) => expect(client.loop()).toBe('loop'),
    },
    {
      // Source: @vitejs/plugin-rsc scope/object-expr-vs-pattern.js
      name: 'an object key and a pattern key',
      code: `export const options = { db: 'key' }
export const pick = ({ db: local }) => local`,
      check: (client) => expect(client.pick(client.options)).toBe('key'),
    },
    {
      // Source: @vitejs/plugin-rsc scope/member-expr.js
      name: 'a member property',
      code: `export const read = (object) => object.db`,
      check: (client) => expect(client.read({ db: 'member' })).toBe('member'),
    },
    {
      // Source: @vitejs/plugin-rsc scope/method-definition.js,
      // scope/property-definition.js; typescript-eslint private-identifier.js
      name: 'method, field and private names',
      code: `export const api = { db() { return 'method' } }
export class Store {
  db = 'field'
  #db = 'private'
  static db() {
    return 'static'
  }
  read() {
    return [this.db, this.#db]
  }
}`,
      check: (client) => {
        expect(client.api.db()).toBe('method')
        expect(client.Store.db()).toBe('static')
        expect(new client.Store().read()).toEqual(['field', 'private'])
      },
    },
    {
      // Source: @vitejs/plugin-rsc scope/export-specifier.js
      name: 'an export alias',
      code: `const local = 'alias'
export { local as db }`,
      check: (client) => expect(client.db).toBe('alias'),
    },
    {
      // Source: @vitejs/plugin-rsc scope/destructuring-assignment.js
      name: 'a destructuring assignment key',
      code: `let bound
;({ db: bound } = { db: 'assigned' })
export { bound }`,
      check: (client) => expect(client.bound).toBe('assigned'),
    },
    {
      // Source: @vitejs/plugin-rsc scope/catch-param.js
      name: 'a catch parameter',
      code: `export function safe() {
  try {
    throw 'caught'
  } catch (db) {
    return db
  }
}`,
      check: (client) => expect(client.safe()).toBe('caught'),
    },
    {
      // Source: @vitejs/plugin-rsc scope/fn-expr-name.js, scope/class-expr-self.js
      name: 'function and class expression names',
      code: `export const self = function db() {
  return db
}
export const Self = class db {
  static self() {
    return db
  }
}`,
      check: (client) => {
        expect(client.self()).toBe(client.self)
        expect(client.Self.self()).toBe(client.Self)
      },
    },
    {
      // Source: @vitejs/plugin-rsc scope/var-hoisting.js, scope/fn-decl-hoisting.js
      name: 'hoisted var and function declarations',
      code: `export function hoistedVar() {
  {
    var db = 'var'
  }
  return db
}
export function hoistedFunction() {
  return db()
  function db() {
    return 'function'
  }
}`,
      check: (client) => {
        expect(client.hoistedVar()).toBe('var')
        expect(client.hoistedFunction()).toBe('function')
      },
    },
    {
      // Source: @vitejs/plugin-rsc scope/let-const-block.js,
      // scope/shadowing-block.js; typescript-eslint block/scope.js
      name: 'loop, switch and static block declarations',
      code: `export function loops() {
  const out = []
  for (let db = 0; db < 1; db++) out.push(db)
  for (const db of ['of']) out.push(db)
  for (const db in { in: 1 }) out.push(db)
  return out
}
export function choose(key) {
  switch (key) {
    case 1:
      return 'one'
    default:
      const db = 'switch'
      return db
  }
}
export class Block {
  static value
  static {
    const db = 'static'
    Block.value = db
  }
}`,
      check: (client) => {
        expect(client.loops()).toEqual([0, 'of', 'in'])
        expect(client.choose(2)).toBe('switch')
        expect(client.Block.value).toBe('static')
      },
    },
    {
      // Source: @vitejs/plugin-rsc scope/destructured-params.js,
      // scope/param-defaults.js; typescript-eslint readable-ref-param-shadow.js
      name: 'parameters, accessor parameters and defaults reading them',
      code: `export const params = (db, other = db) => other
export const accessors = {
  stored: '',
  set value(db) {
    this.stored = db
  },
}
export function rest(...db) {
  return db
}`,
      check: (client) => {
        expect(client.params('param')).toBe('param')
        client.accessors.value = 'set'
        expect(client.accessors.stored).toBe('set')
        expect(client.rest(1, 2)).toEqual([1, 2])
      },
    },
    {
      // Source: @vitejs/plugin-rsc scope/import-meta.js
      name: 'an import.meta property',
      code: `export const meta = typeof import.meta.db`,
      check: (client) => expect(client.meta).toBe('undefined'),
    },
    {
      // Source: @vitejs/plugin-rsc hoist/reexport-import-not-bound.js
      name: 'a re-export',
      code: `export { db } from './other'`,
      stubs: { './other': `export const db = 'other'` },
      check: (client) => expect(client.db).toBe('other'),
    },
    {
      // Source: typescript-eslint ts-module/namespace.js, ts-module/scope.js
      name: 'a namespace member',
      code: `export namespace Repo {
  export const db = 'namespace'
  export const read = () => db
}`,
      check: (client) => expect(client.Repo.read()).toBe('namespace'),
    },
    {
      // Source: typescript-eslint type-declaration/interface1.js, type1.js,
      // function-declaration/type-parameters
      name: 'type positions',
      code: `export interface Row {
  db: string
}
export type Shape = { db: number }
export function identity<db>(value: db): db {
  return value
}`,
      check: (client) => expect(client.identity('id')).toBe('id'),
    },
    {
      // Source: typescript-eslint jsx/attribute.js, jsx/namespaced-attribute.js,
      // jsx/component-intrinsic-name.js, jsx/this-jsxidentifier.js
      name: 'JSX attribute names, intrinsic tags and this members',
      code: `export const element = <svg db="attribute" xlink:db="namespaced" />
export const intrinsic = <db />
export const namespaced = <db:tag />
export class View {
  db = () => null
  render() {
    return <this.db />
  }
}`,
    },
  ])(
    'when client code uses its name in $name',
    async ({ code, stubs = {}, check }) => {
      const client = await compileCode(
        'client',
        `${head}import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.x())
${code}`,
      )
      expect(await getModuleErrors(client!)).toEqual([])
      expect(importSources(client!)).toEqual(Object.keys(stubs))
      check?.(await evaluateModule(client!, stubs))
    },
  )

  // Source: SolidStart compile.spec.ts "removes an import when only type
  // specifiers remain", "preserves live value specifiers from a mixed
  // import"; babel-dead-code-elimination "import" > "mixed default and named"
  test.each([
    {
      name: 'only type specifiers remain',
      code: `import { type Session, verify } from './server-module'`,
      callers: [],
    },
    {
      name: 'a named client specifier remains',
      code: `import verify, { type Session, clientValue } from './server-module'
export const value = clientValue`,
      callers: ['./server-module'],
    },
    {
      name: 'a default client specifier remains',
      code: `import clientDefault, { type Session, verify } from './server-module'
export const value = clientDefault`,
      callers: ['./server-module'],
    },
  ])(
    'when it shares a mixed import in which $name',
    async ({ code, callers }) => {
      const compiled = await compileAll(`${head}${code}
export const fn = createServerFn().handler(async (): Promise<Session | null> => verify())`)
      for (const caller of [compiled.client, compiled.ssr]) {
        expect(importSources(caller)).toEqual(callers)
        expect(caller).not.toMatch(/\bverify\b/)
      }
      expect(compiled.provider).not.toMatch(/\bclient(?:Value|Default)\b/)
      expect(
        await callProvider(compiled.provider, 'fn', {
          './server-module': `export const clientValue = 'client'; export const verify = () => 'verified'; export default verify`,
        }),
      ).toBe('verified')
    },
  )

  // Source: Next.js server-actions fixtures server-graph/47, /58
  test('when the handler only reads it through a validator or a middleware', async () => {
    const compiled =
      await compileAll(`import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
import { schema } from './schema.server'
const auth = createMiddleware({ type: 'function' })
  .client(async ({ next }) => next())
  .server(async ({ next }) => next({ context: { user: await db.user() } }))
export const fn = createServerFn()
  .middleware([auth])
  .validator((data: unknown) => schema.parse(data))
  .handler(async () => 'ok')`)
    expect(importSources(compiled.client)).toEqual([])
    expect(importSources(compiled.provider)).toEqual([
      './db.server',
      './schema.server',
    ])
  })
})

// Source: @vitejs/plugin-rsc hoist/function-hoist-block.js,
// scope/param-default-var-hoisting.js, hoist/shadow-partial-if-block-over-global.js,
// hoist/catch-binding-shadow.js
test.each([
  {
    name: 'past a function declared in a nested block',
    code: `export function read() {
  {
    function store() {}
  }
  return store.value
}`,
  },
  {
    name: 'from a parameter default next to a var of the same name',
    code: `export function read(value = store.value) {
  var store = 'local'
  return value
}`,
  },
  {
    name: 'after a block that shadows it',
    code: `export function read() {
  if (Math.random() > 2) {
    const store = { value: 'local' }
    return store.value
  }
  return store.value
}`,
  },
  {
    name: 'in a try block whose catch parameter shadows it',
    code: `export function read() {
  try {
    return store.value
  } catch (store) {
    return store
  }
}`,
  },
])('client code that reads an import $name keeps it', async ({ code }) => {
  const client = await compileCode(
    'client',
    `${head}import { store } from './store'
import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.x())
${code}`,
  )
  expect(importSources(client!)).toEqual(['./store'])
  const module = await evaluateModule(client!, {
    './store': `export const store = { value: 'store' }`,
  })
  expect(module.read()).toBe('store')
})

describe('destructurings shared by the handler and client code', () => {
  // Source: Next.js server-actions fixtures server-graph/6, client-graph/3
  test.each<{
    name: string
    code: string
    stubs: Record<string, ModuleStub>
    clientValue: unknown
    handlerValue: unknown
  }>([
    {
      name: 'an array pattern',
      code: `import { values } from './values'
const [serverOnly, shared] = values
export const clientValue = shared
export const fn = createServerFn().handler(async () => serverOnly)`,
      stubs: { './values': `export const values = ['server', 'shared']` },
      clientValue: 'shared',
      handlerValue: 'server',
    },
    {
      // Dropping the handler-only `secretKey` would move it into the rest.
      name: 'an object pattern whose rest the client uses',
      code: `import { config } from './config'
const { secretKey, ...publicConfig } = config
export const clientValue = publicConfig
export const fn = createServerFn().handler(async () => secretKey)`,
      stubs: {
        './config': `export const config = { secretKey: 'key', theme: 'dark' }`,
      },
      clientValue: { theme: 'dark' },
      handlerValue: 'key',
    },
  ])(
    'keep their values in every output for $name',
    async ({ code, stubs, clientValue, handlerValue }) => {
      const compiled = await compileAll(`${head}${code}`)
      const client = await evaluateModule(compiled.client, stubs)
      expect(client.clientValue).toEqual(clientValue)
      expect(await callProvider(compiled.provider, 'fn', stubs)).toEqual(
        handlerValue,
      )
    },
  )

  // When one binding of a destructuring stays live, the elements of the
  // handler-only bindings are pruned, including what their default values or
  // computed keys read.
  // Source: Next.js server-actions fixtures server-graph/6, /43
  test.each([
    {
      name: 'an object pattern default',
      code: `import { readSecret } from './secrets.server'
const { apiKey = readSecret(), theme } = config`,
    },
    {
      name: 'an array pattern default',
      code: `import { readSecret } from './secrets.server'
const [apiKey = readSecret(), theme] = config.list`,
    },
    {
      name: 'a computed key',
      code: `import { secretKeyName } from './secrets.server'
const { [secretKeyName]: apiKey, theme } = config`,
    },
    {
      name: 'a nested pattern default',
      code: `import { readSecret } from './secrets.server'
const { db: { apiKey = readSecret() } = {}, theme } = config`,
    },
  ])(
    'drop a server import read by $name of a handler-only binding',
    async ({ code }) => {
      const compiled =
        await compileAll(`${head}import { config } from './config'
${code}
export const fn = createServerFn().handler(async () => apiKey)
export const currentTheme = theme`)
      expect(importSources(compiled.client)).toEqual(['./config'])
      const client = await evaluateModule(compiled.client, {
        './config': `export const config = { theme: 'dark', list: [undefined, 'dark'] }`,
      })
      expect(client.currentTheme).toBe('dark')
    },
  )
})

describe('declarations only the handler needs', () => {
  // Source: babel-dead-code-elimination "SCC dead code elimination" (mutual
  // recursion, self-recursive functions, unexported circular references)
  test('callers drop handler-only cycles and default parameters but keep cycles nothing used', async () => {
    const compiled =
      await compileAll(`${head}import { secret, defaultId } from './secret.server'
function walk(n: number): number { return n > 0 ? walkBack(n - 1) : secret.length }
function walkBack(n: number): number { return n > 0 ? walk(n - 1) : 0 }
const loop = (n: number): number => (n > 0 ? loop(n - 1) : 0)
function load(id = defaultId()) { return id }
function unusedA(): number { return unusedB() }
function unusedB(): number { return unusedA() }
export const fn = createServerFn().handler(async () => [walk(3), loop(2), load()])`)
    for (const caller of [compiled.client, compiled.ssr]) {
      expect(importSources(caller)).toEqual([])
      for (const name of ['walk', 'walkBack', 'loop', 'load']) {
        expect(caller).not.toMatch(declarationOf(name))
      }
    }
    for (const name of ['walk', 'walkBack', 'loop', 'load']) {
      expect(compiled.provider).toMatch(declarationOf(name))
    }
    for (const output of [compiled.client, compiled.ssr, compiled.provider]) {
      expect(output).toMatch(declarationOf('unusedA'))
      expect(output).toMatch(declarationOf('unusedB'))
    }
  })

  // Source: babel-dead-code-elimination "assignment"
  test('callers keep handler-read bindings that top-level statements assign', async () => {
    const compiled = await compileAll(`${head}let x: string
x = 'x-assigned'
y = 'y-assigned'
var y: string
export const fn = createServerFn().handler(async () => [x, y])`)
    // An assignment left without its declaration throws in a module.
    await evaluateModule(compiled.client)
    await evaluateModule(compiled.ssr)
    expect(await callProvider(compiled.provider, 'fn')).toEqual([
      'x-assigned',
      'y-assigned',
    ])
  })

  // Source: babel-dead-code-elimination "repeated elimination"
  test('callers drop a binding only the handler writes and keep a declarator a kept sibling reads', async () => {
    const compiled =
      await compileAll(`${head}import { serverValue } from './db.server'
let hits = 0
let a = serverValue(), clientCopy = a
export const fn = createServerFn().handler(async () => {
  hits++
  return a
})
export const clientB = clientCopy`)
    for (const caller of [compiled.client, compiled.ssr]) {
      expect(caller).not.toMatch(declarationOf('hits'))
      expect(caller).toMatch(declarationOf('a'))
      expect(importSources(caller)).toEqual(['./db.server'])
    }
    expect(compiled.provider).toMatch(declarationOf('hits'))
    expect(compiled.provider).not.toContain('clientCopy')
  })

  // Source: babel-dead-code-elimination "variable" > "within for...in",
  // "within for...of" (var bindings declared inside nested statements)
  test('callers drop handler-only vars declared inside top-level statements', async () => {
    const calls = ['openFlag', 'connect', 'readMode', 'readLabel', 'createPool']
    const compiled =
      await compileAll(`${head}import { ${calls.join(', ')} } from './db.server'
if (typeof window === 'undefined') {
  var flag = openFlag()
}
try {
  var conn = connect()
} catch {}
switch (process.env.MODE) {
  case 'x':
    var mode = readMode()
}
outer: {
  var labeled = readLabel()
  break outer
}
for (var i = 0, pool = createPool(); i < 1; i++) {}
export const fn = createServerFn().handler(async () => [flag, conn, mode, labeled, pool])`)
    for (const caller of [compiled.client, compiled.ssr]) {
      expect(importSources(caller)).toEqual([])
      for (const call of calls) {
        expect(caller).not.toContain(call)
      }
    }
    for (const call of calls) {
      expect(compiled.provider).toContain(`${call}()`)
    }
  })
})
