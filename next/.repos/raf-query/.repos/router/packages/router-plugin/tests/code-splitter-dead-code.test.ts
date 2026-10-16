import { describe, expect, it } from 'vitest'
import {
  compileRouteModules,
  declarationOf,
  evaluateModule,
  expectValidModules,
  head,
  importSources,
  importedNames,
  transformWithRouteHmrPlugin,
} from './regression-helpers'

const sharedModule = 'route.tsx?tsr-shared=1'

/** Whether a module declares `name` or imports it from the shared module. */
function binds(module: string, name: string) {
  return (
    declarationOf(name).test(module) ||
    importedNames(module, sharedModule).includes(name)
  )
}

/**
 * The reference module, compiled without and with React HMR: HMR rewrites the
 * route options (hoisted components, refresh anchor) before dead code is
 * removed, so the removal runs on a different program.
 */
function referenceModules(code: string) {
  return {
    reference: compileRouteModules(code).modules.reference!,
    'reference with HMR': compileRouteModules(code, { hmr: true }).modules
      .reference!,
  }
}

/**
 * Renders the split component the way an app loads it: the shared module (if
 * any) and the reference module run first, then the component chunk, all
 * linked to one instance of the shared module. A top-level statement may then
 * reach the component by moving into its chunk or by staying in the
 * reference module and writing to a shared binding.
 */
async function renderSplitComponent(modules: Record<string, string>) {
  const stubs: Record<string, Record<string, unknown>> = {}
  if (modules.shared) {
    stubs[sharedModule] = await evaluateModule(modules.shared)
  }
  await evaluateModule(modules.reference!, {
    ...stubs,
    '@tanstack/react-router': {
      createFileRoute: () => (options: unknown) => ({ options }),
      lazyRouteComponent: () => () => null,
    },
  })
  const chunk = await evaluateModule(modules['virtual component']!, stubs)
  return chunk.component!()
}

describe('the reference module only drops code that splitting left unused', () => {
  it.each([
    {
      name: 'a store subscription that unsubscribes itself',
      setup: `import { store } from './store'
const unsubscribe = store.subscribe(() => {
  if (store.state.done) unsubscribe()
})`,
      declared: ['unsubscribe'],
    },
    {
      name: 'mutually-referencing declarations',
      setup: `import { createPersister } from './persist'
const persister = createPersister({ onRestore: () => restore() })
function restore() {
  persister.restore()
}`,
      declared: ['persister', 'restore'],
    },
    {
      // Source: babel-dead-code-elimination dead-code-elimination.test.ts "only
      // eliminates newly unreferenced identifiers", "unexported circular references"
      // and "SCC with external caller used -> all preserved"
      name: 'unused functions, one calling a helper of the split component',
      setup: `function helper() { return 'helper' }
function unused() { return helper() }
function ping(): number { return pong() }
function pong(): number { return ping() }`,
      component: '<p>{helper()}</p>',
      declared: ['helper', 'unused', 'ping', 'pong'],
    },
  ])(
    'keeps $name that nothing used before splitting',
    async ({ setup, component = '<div />', declared }) => {
      const code = `${head}${setup}
export const Route = createFileRoute('/')({ component: () => ${component} })
`
      const modules = referenceModules(code)
      // The validator does not report references to undeclared names. A
      // binding the split component reads may come from the shared module.
      for (const [module, reference] of Object.entries(modules)) {
        for (const name of declared) {
          expect(binds(reference, name), `${module} binds ${name}`).toBe(true)
        }
      }
      await expectValidModules(modules)
    },
  )

  // Source: babel-dead-code-elimination dead-code-elimination.test.ts "SCC dead
  // code elimination" > "arrow functions in mutual recursion -> removed"
  it('moves mutually recursive helpers only the component uses, and their imports, into its chunk', async () => {
    const code = `${head}import { dep } from './dep'
const ping = (n: number): number => (n > 0 ? pong(n - 1) : 0)
const pong = function (n: number): number { return n > 0 ? ping(n - 1) : dep }
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{ping(3)}</p>,
})
`
    for (const reference of Object.values(referenceModules(code))) {
      expect(reference).not.toMatch(declarationOf('ping'))
      expect(reference).not.toMatch(declarationOf('pong'))
      expect(importSources(reference)).not.toContain('./dep')
    }
    const { modules } = compileRouteModules(code)
    expect(modules['virtual component']).toMatch(declarationOf('ping'))
    expect(modules['virtual component']).toMatch(declarationOf('pong'))
    await expectValidModules(modules)
  })

  // Source: Next.js ssg/getStaticProps/should-remove-re-exported-function-declarations-dependents-variables-functions-imports
  it('keeps the import specifiers nothing used before splitting', async () => {
    const { modules } =
      compileRouteModules(`${head}import { used, preUnused } from 'bar'
const b = function apples() { return used }
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{b()}</p>,
})
`)
    expect(importedNames(modules.reference!, 'bar')).toEqual(['preUnused'])
    expect(modules.reference).not.toContain('apples')
    expect(modules['virtual component']).toMatch(declarationOf('b'))
    expect(importedNames(modules['virtual component']!, 'bar')).toContain(
      'used',
    )
    await expectValidModules(modules)
  })

  // Source: React Router route-chunks-test.ts "shared imports across chunks but
  // not main chunk with shared side effect usage"
  it('runs a top-level call only in the reference module, even when the chunks import its callee', async () => {
    const { modules } =
      compileRouteModules(`${head}import { shared } from './shared'
shared('side-effect-marker')
export const Route = createFileRoute('/')({
  component: () => <div>{shared('component')}</div>,
  errorComponent: () => <div>{shared('error')}</div>,
})
`)
    expect(modules.reference).toContain('side-effect-marker')
    expect(modules['virtual component']).not.toContain('side-effect-marker')
    expect(modules['virtual errorComponent']).not.toContain(
      'side-effect-marker',
    )
    await expectValidModules(modules)
  })

  // TypeScript erases type positions, so a declaration whose binding only
  // appears in a type is still live code that runs when the route loads.
  it.each([
    {
      name: 'the reference module',
      compile: (code: string) => compileRouteModules(code).modules.reference!,
    },
    {
      name: 'a route module compiled for HMR',
      compile: (code: string) => transformWithRouteHmrPlugin(code),
    },
  ])(
    'keeps a declaration only referenced from types in $name',
    async ({ compile }) => {
      const output =
        compile(`${head}import { registerAnalytics } from './analytics'
const analytics = registerAnalytics('/posts')
declare module './analytics' {
  interface Registry {
    posts: typeof analytics
  }
}
export const Route = createFileRoute('/posts')({
  component: () => <p>posts</p>,
})
`)
      expect(output).toMatch(declarationOf('analytics'))
      expect(output).toContain('registerAnalytics(')
      await expectValidModules({ output })
    },
  )
})

describe('code a split option needs moves with it', () => {
  // Source: Qwik optimizer test.rs should_not_move_over_side_effects,
  // example_drop_side_effects; Turbopack tree-shaker analyzer/route-kind
  it.each([
    {
      name: 'a compound component member assignment',
      setup: `function Card({ children }) { return <div>{children}</div> }
Card.Title = function Title() { return <h1>t</h1> }`,
      render: '<Card><Card.Title /></Card>',
      rendered: '<div><h1>t</h1></div>',
    },
    {
      name: 'a registry filled by a top-level call',
      setup: `const registry = new Map()
registry.set('a', 'A')`,
      render: `<p>{registry.get('a')}</p>`,
      rendered: '<p>A</p>',
    },
    {
      name: 'a compiled enum initializing a var',
      setup: `var Kind: any
;(function (Kind: any) {
  Kind['A'] = 'a'
})(Kind || (Kind = {}))`,
      render: '<p>{Kind.A}</p>',
      rendered: '<p>a</p>',
    },
  ])(
    'renders a split component that relies on $name',
    async ({ setup, render, rendered }) => {
      const { modules } = compileRouteModules(`${head}${setup}
export const Route = createFileRoute('/')({
  component: () => ${render},
})
`)
      await expectValidModules(modules)
      expect(await renderSplitComponent(modules)).toBe(rendered)
    },
  )

  // Source: React Compiler hook-ref-callback.js and
  // dont-memoize-primitive-function-call-non-escaping.js: a function shared by
  // the loader and the split component declares a local it never reads.
  it.each([
    { name: 'a call', initializer: 'track(id)' },
    { name: 'an optional call', initializer: 'track?.(id)' },
  ])(
    'keeps an unused local initialized by $name in a shared function',
    async ({ initializer }) => {
      const { modules } =
        compileRouteModules(`${head}import { track } from './track'
function useShared(id) {
  const unused = ${initializer}
  return id
}
export const Route = createFileRoute('/')({
  loader: () => useShared('loader'),
  component: () => <p>{useShared('component')}</p>,
})
`)
      const calls: Array<string> = []
      const shared = await evaluateModule(modules.shared!, {
        './track': { track: (label: string) => calls.push(label) },
      })
      expect(shared.useShared!('render')).toBe('render')
      expect(calls).toEqual(['render'])
    },
  )

  // Source: babel-dead-code-elimination dead-code-elimination.test.ts "object
  // pattern" > "within function param"
  it('keeps empty destructuring parameters of helpers moved into the chunk', async () => {
    const { modules } =
      compileRouteModules(`${head}function f(a: any, {}: any) { return a }
const g = (a: any, []: any) => a
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{f.length}{g.length}</p>,
})
`)
    const chunk = await evaluateModule(modules['virtual component']!)
    expect(chunk.component!()).toBe('<p>22</p>')
  })

  // Source: React Router remove-exports-test.ts "iife with dependencies"
  it('moves a component created by an IIFE with its dependencies and shares the helper the loader uses too', async () => {
    const { modules, sharedBindings } =
      compileRouteModules(`${head}import { removedLib } from 'removed-lib'
import { keptLib } from 'kept-lib'
import { sharedLib } from 'shared-lib'
const sharedUtil = (value?: unknown) => sharedLib(value)
const removedUtil = () => sharedUtil(removedLib())
const keptUtil = () => sharedUtil(keptLib())
const Page = (() => {
  const message = removedUtil()
  return () => <div>{String(message)}</div>
})()
export const Route = createFileRoute('/')({
  loader: () => keptUtil(),
  component: Page,
})
`)
    expect(sharedBindings).toEqual(['sharedUtil'])
    expect(importSources(modules.reference!)).toEqual([
      '@tanstack/react-router',
      'kept-lib',
      'route.tsx?tsr-shared=1',
    ])
    expect(modules.reference).not.toContain('removedUtil')
    expect(importSources(modules['virtual component']!)).toEqual([
      'removed-lib',
      'route.tsx?tsr-shared=1',
    ])
    expect(modules['virtual component']).toMatch(declarationOf('Page'))
    expect(importSources(modules.shared!)).toEqual(['shared-lib'])
    await expectValidModules(modules)
  })

  // Source: React Router route-chunks-test.ts "isolated exported variable
  // declarations sharing an export statement"; Next.js
  // ssg/getStaticProps/should-remove-re-exported-variable-declarations-safe
  it.each([
    {
      name: 'plain declarators',
      declarations: `const Page = () => <div>{chunkMessage}</div>,
  main = mainMessage`,
    },
    {
      name: 'destructured declarators',
      declarations: `const { Page } = { Page: () => <div>{chunkMessage}</div> },
  { main } = { main: mainMessage }`,
    },
  ])(
    'gives each of the $name of one statement to the module that reads it',
    async ({ declarations }) => {
      const { modules, sharedBindings } =
        compileRouteModules(`${head}import { chunkMessage, mainMessage } from './messages'
${declarations}
export const Route = createFileRoute('/')({
  loader: () => main,
  component: Page,
})
`)
      expect(sharedBindings).toEqual([])
      expect(importedNames(modules.reference!, './messages')).toEqual([
        'mainMessage',
      ])
      expect(modules.reference).not.toMatch(/\bPage\b/)
      expect(
        importedNames(modules['virtual component']!, './messages'),
      ).toEqual(['chunkMessage'])
      expect(modules['virtual component']).not.toMatch(/\bmain\b/)
      await expectValidModules(modules)
    },
  )

  // Source: React Router route-chunks-test.ts "exported variable declarations
  // sharing an export statement"
  it('shares a declarator that a sibling declarator reads', async () => {
    const { modules, sharedBindings } =
      compileRouteModules(`${head}import { sharedMessage } from './messages'
const Page = () => <div>{sharedMessage}</div>,
  Preview = Page
export const Route = createFileRoute('/')({
  loader: () => Preview.name,
  component: Page,
})
`)
    expect(sharedBindings).toEqual(['Page'])
    expect(modules.shared).toMatch(declarationOf('Page'))
    expect(modules.reference).toMatch(declarationOf('Preview'))
    expect(importedNames(modules.reference!, sharedModule)).toEqual(['Page'])
    expect(modules.reference).not.toMatch(declarationOf('Page'))
    expect(modules['virtual component']).not.toMatch(declarationOf('Page'))
    await expectValidModules(modules)
  })
})

describe('var declarations nested in top-level statements', () => {
  it.each([
    {
      name: 'a for loop head',
      setup: 'for (var value = 0; value < 3; value++) {}',
    },
    { name: 'a for-of head', setup: "for (var value of ['a']) {}" },
    {
      name: 'an if block',
      setup: "if (typeof window === 'undefined') { var value = 'server' }",
    },
  ])(
    'stay bound in every module when $name declares a binding the loader and the component read',
    async ({ setup }) => {
      const { modules } = compileRouteModules(`${head}${setup}
export const Route = createFileRoute('/')({
  loader: () => value,
  component: () => <div>{value}</div>,
})
`)
      // Known limitation on main: the statement runs in both modules instead
      // of once in the shared module; only check that each module binds `value`.
      for (const name of ['reference', 'virtual component']) {
        expect(binds(modules[name]!, 'value'), `${name} binds value`).toBe(true)
      }
      await expectValidModules(modules)
    },
  )

  it('stay bound in the reference module when exported and read by the component', async () => {
    const { modules } =
      compileRouteModules(`${head}if (typeof window === 'undefined') { var flag = 'server' }
export { flag }
export const Route = createFileRoute('/')({
  component: () => <div>{flag}</div>,
})
`)
    expect(binds(modules.reference!, 'flag')).toBe(true)
    await expectValidModules(modules)
  })

  // Source: babel-dead-code-elimination dead-code-elimination.test.ts "variable"
  // (var bindings declared inside nested statements)
  it('follow the only option that reads them', async () => {
    const { modules } =
      compileRouteModules(`${head}import { compute, connect } from './lib'
if (typeof window !== 'undefined') {
  var flag = compute()
}
for (var index = 0; index < 3; index++) {}
{
  var block = connect()
}
export const Route = createFileRoute('/')({
  loader: () => block,
  component: () => <p>{String(flag)}{index}</p>,
})
`)
    expect(modules.reference).not.toContain('compute()')
    expect(modules.reference).toMatch(declarationOf('block'))
    const chunk = modules['virtual component']!
    expect(chunk).toMatch(declarationOf('flag'))
    expect(chunk).toMatch(declarationOf('index'))
    expect(chunk).not.toContain('connect()')
    await expectValidModules(modules)
  })
})

describe('robustness', () => {
  it('compiles a route with a long method chain', async () => {
    // Builder APIs (schemas, query builders) produce deep left-nested calls
    const chain = Array.from({ length: 200 }, (_, i) => `.add(${i})`).join('')
    const { modules } =
      compileRouteModules(`${head}import { builder } from './builder'
const schema = builder()${chain}
export const Route = createFileRoute('/')({
  loader: () => schema,
  component: () => <div>{String(schema)}</div>,
})
`)
    expect(modules.shared).toContain('.add(199)')
    await expectValidModules(modules)
  })
})
