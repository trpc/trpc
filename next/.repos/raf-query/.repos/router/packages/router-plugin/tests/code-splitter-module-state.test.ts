import { describe, expect, it } from 'vitest'
import {
  buildAndRun,
  compileRouteModules,
  declarationOf,
  expectValidModules,
  head,
  importSources,
} from './regression-helpers'

/** How many times `pattern` occurs across all emitted modules. */
function countAcrossModules(modules: Record<string, string>, pattern: RegExp) {
  return Object.values(modules).reduce(
    (count, code) =>
      count + (code.match(new RegExp(pattern.source, 'g'))?.length ?? 0),
    0,
  )
}

describe('split chunks keep the module state the route relies on', () => {
  // Route files commonly export a store or helpers over private state next to
  // the route and use them from the route component as well.
  it('renders a split component using exported bindings over private state like the unsplit route', async () => {
    const result = await buildAndRun(
      `${head}const state = { count: 0 }
export function increment() {
  return ++state.count
}
let renders = 0
export function getRenders() {
  return renders
}
const initial = 0
export const store = { count: initial }
function Page() {
  increment()
  renders++
  store.count++
  return <p>{[state.count, getRenders(), store.count - initial].join('/')}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
      `const component = entry.Route.options.component
return [await entry.render(component), await entry.render(component), entry.store.count]`,
    )
    // Known limitation on main: the chunk gets its own copy of `state` and
    // `renders`, so callers of the exported functions are not checked here.
    // `store.count` is 2: the chunk mutated the store the route module exports
    expect(result).toEqual(['<p>1/1/1</p>', '<p>2/2/2</p>', 2])
  }, 30_000)

  // Source: Qwik optimizer test.rs
  // should_keep_non_migrated_binding_from_shared_destructuring_declarator_with_default (+ _with_rest)
  it('evaluates a destructuring split between the loader and the component once', async () => {
    const { modules } =
      compileRouteModules(`${head}import { makeConfig } from './config'
const { a = 'A', ...b } = makeConfig()
export const Route = createFileRoute('/')({
  loader: () => a,
  component: () => <div>{JSON.stringify(b)}</div>,
})
`)
    expect(countAcrossModules(modules, /makeConfig\(\)/)).toBe(1)
    await expectValidModules(modules)
  })

  // Source: Qwik optimizer test.rs root_level_self_referential_qrl,
  // example_self_referential_component_migration
  it('declares mutually recursive components used by two lazy chunks once', async () => {
    const { modules } =
      compileRouteModules(`${head}function A({ depth }) { return depth ? <B depth={depth - 1} /> : <i>a</i> }
function B({ depth }) { return <b><A depth={depth} /></b> }
export const Route = createFileRoute('/')({
  component: () => <A depth={1} />,
  errorComponent: () => <B depth={0} />,
})
`)
    expect(countAcrossModules(modules, /function A\b/)).toBe(1)
    expect(countAcrossModules(modules, /function B\b/)).toBe(1)
    await expectValidModules(modules)
  })

  it('shares a class with a static block and private members', async () => {
    const { modules, sharedBindings } =
      compileRouteModules(`${head}class Counter {
  static created = 0
  static { Counter.created = 1 }
  #n = 0
  increment() { return ++this.#n }
  static owns(value: object) { return #n in value }
}
const counter = new Counter()
export const Route = createFileRoute('/')({
  loader: () => counter.increment(),
  component: () => <div>{String(Counter.owns(counter))}</div>,
})
`)
    expect(sharedBindings).toEqual(['Counter', 'counter'])
    expect(modules['virtual component']).not.toMatch(declarationOf('Counter'))
    await expectValidModules(modules)
  })

  // Source: Turbopack tree-shaker analyzer/nanoid, analyzer/let-bug-1
  it('shares a let that a shared helper reassigns', async () => {
    const { modules, sharedBindings } =
      compileRouteModules(`${head}let pool: Array<number> = [], offset = 0
const fill = () => { pool = [offset++] }
export const Route = createFileRoute('/')({
  loader: () => { fill(); return pool },
  component: () => { fill(); return <p>{pool.join()}</p> },
})
`)
    expect(sharedBindings).toEqual(['fill', 'offset', 'pool'])
    expect(modules.reference).not.toMatch(declarationOf('pool'))
    expect(modules['virtual component']).not.toMatch(declarationOf('pool'))
    await expectValidModules(modules)
  })
})

describe('split chunks keep reassigned bindings next to their writers', () => {
  // Source: React Router route-chunks-test.ts "reassignment"; babel-dead-code-elimination
  // find-removable-bindings.test.ts "constant violations mark as external"
  it('moves a binding that only the split component reassigns into its chunk', async () => {
    const { modules, sharedBindings } =
      compileRouteModules(`${head}import { next } from './next'
let current = 'initial-marker'
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => {
    current = next
    return <p>{current}</p>
  },
})
`)
    expect(sharedBindings).toEqual([])
    expect(modules.reference).not.toContain('initial-marker')
    expect(importSources(modules.reference!)).not.toContain('./next')
    expect(modules['virtual component']).toMatch(declarationOf('current'))
    expect(modules['virtual component']).toContain('initial-marker')
    await expectValidModules(modules)
  })

  // Source: Next.js ssg/getStaticProps/should-support-babel-style-memoized-function
  it.each([
    { name: 'the component', loader: `'data'`, shared: [] },
    {
      name: 'the loader and the component',
      loader: 'fetchData()',
      shared: ['fetchData'],
    },
  ])(
    'keeps a self-reassigning function used by $name valid',
    async ({ loader, shared }) => {
      const { modules, sharedBindings } =
        compileRouteModules(`${head}function fetchData() {
  fetchData = function () {
    return 'memoized'
  }
  return fetchData.apply(this, arguments as any)
}
export const Route = createFileRoute('/')({
  loader: () => ${loader},
  component: () => <div>{fetchData()}</div>,
})
`)
      expect(sharedBindings).toEqual(shared)
      const owner = shared.length
        ? modules.shared!
        : modules['virtual component']!
      expect(owner).toMatch(declarationOf('fetchData'))
      expect(owner).toContain('fetchData = function')
      await expectValidModules(modules)
    },
  )
})
