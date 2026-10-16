/**
 * Route HMR keeps the previous `component` (and the other component options)
 * so that React Refresh can patch it in place. That only works when the value
 * is bound to a top-level name React Refresh registers. These tests compile
 * route files with the HMR transforms, then run Vite's Oxc React Refresh
 * transform (the one `@vitejs/plugin-react` uses) on the output to see which
 * components are registered and how their hook signatures are computed.
 */
import { describe, expect, it } from 'vitest'
import {
  compileRouteModules,
  declarationOf,
  declaratorName,
  evaluateModule,
  expectRegisteredRouteOption,
  exportedNames,
  getRouteOption,
  head,
  importedNames,
  parseModule,
  reactRefresh,
  topLevelDeclarators,
  transformWithRouteHmrPlugin,
} from './regression-helpers'
import type { ESTree } from 'vite'

/** Compiles every module the code splitter emits, with React HMR. */
function compileWithCodeSplitting(code: string) {
  return compileRouteModules(code, { hmr: true }).modules
}

describe('React Refresh registers route components', () => {
  // Source: React Refresh ReactFreshBabelPlugin-test "registers top-level
  // variable declarations with function expressions" and "... with arrow functions"
  it.each([
    ['an arrow function', `() => <p>hi</p>`],
    ['an anonymous function expression', `function () { return <p>hi</p> }`],
    ['a parenthesized arrow function', `(() => <p>hi</p>)`],
  ])('written inline as %s', async (_, component) => {
    const code = transformWithRouteHmrPlugin(
      `${head}export const Route = createFileRoute('/')({ component: ${component} })`,
    )
    await expectRegisteredRouteOption(code, 'component')
  })

  it('for every inline component option of a root route, under distinct names', async () => {
    const options = {
      component: '() => <p>component</p>',
      pendingComponent: '() => <p>pending</p>',
      errorComponent: '({ error }) => <p>{String(error)}</p>',
      notFoundComponent: '() => <p>not found</p>',
      shellComponent: '({ children }) => <html><body>{children}</body></html>',
    }
    const { reference } = compileWithCodeSplitting(
      `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({
${Object.entries(options)
  .map(([key, value]) => `  ${key}: ${value},`)
  .join('\n')}
})`,
    )
    const bindings = new Set<string>()
    for (const option of Object.keys(options)) {
      bindings.add(await expectRegisteredRouteOption(reference!, option))
    }
    expect(bindings.size).toBe(Object.keys(options).length)
  })

  // Source: ReactFreshBabelPlugin-test "only registers pascal case functions"
  // and "uses original function declaration if it get reassigned"
  it.each([
    ['a const arrow function', `const page = () => <p>hi</p>`],
    [
      'a function expression that names itself',
      `const page = function page() { return <p>{typeof page}</p> }`,
    ],
    [
      'a reassigned function declaration',
      `import { connect } from './connect'\nfunction page() { return <p>hi</p> }\npage = connect(page)`,
    ],
  ])('declared lowercase as %s, by renaming it', async (_, declaration) => {
    const code = transformWithRouteHmrPlugin(
      `${head}${declaration}\nexport const Route = createFileRoute('/')({ component: page })`,
    )
    const binding = await expectRegisteredRouteOption(code, 'component')
    expect(binding).toMatch(/^[A-Z]/)
  })

  // Source: ReactFreshBabelPlugin-test "registers top-level exported function
  // declarations" and "registers top-level exported named arrow functions"
  it.each([
    ['export function page', `export function page() { return <p>hi</p> }`],
    ['export { page }', `const page = () => <p>hi</p>\nexport { page }`],
    [
      'export default page',
      `function page() { return <p>hi</p> }\nexport default page`,
    ],
  ])(
    'renamed lowercase and exported (%s), keeping the exports',
    async (_, declaration) => {
      const source = `${head}${declaration}\nexport const Route = createFileRoute('/')({ component: page })`
      const code = transformWithRouteHmrPlugin(source)
      await expectRegisteredRouteOption(code, 'component')
      expect(exportedNames(code)).toEqual(
        expect.arrayContaining(exportedNames(source)),
      )
    },
  )

  // Source: ReactFreshBabelPlugin-test "does not consider require-like methods to be HOCs"
  it('but leaves an imported lowercase component to the module that declares it', () => {
    const code = transformWithRouteHmrPlugin(
      `${head}import { page } from './page'
export const Route = createFileRoute('/')({ component: page })`,
    )
    const { value } = getRouteOption(parseModule(code), 'component')
    expect((value as ESTree.IdentifierReference).name).toBe('page')
    expect(importedNames(code, './page')).toEqual(['page'])
  })

  // Source: ReactFreshBabelPlugin-test "registers top-level function declarations"
  it('renames only the component binding, not an inner binding with its name', async () => {
    const code = transformWithRouteHmrPlugin(
      `${head}function page() {
  const page = 'inner-marker'
  return <p>{page}</p>
}
export const Route = createFileRoute('/')({ component: page })`,
    )
    await expectRegisteredRouteOption(code, 'component')
    const { Route } = await evaluateModule(code, {
      '@tanstack/react-router': {
        createFileRoute: () => (options: unknown) => ({ options }),
      },
    })
    expect((Route as any).options.component()).toBe('<p>inner-marker</p>')
  })

  // Source: ReactFreshIntegration-test "preserves state ..." (families are
  // matched by registration name)
  it('names hoisted components after their option, so adding options keeps the family', async () => {
    const before = transformWithRouteHmrPlugin(
      `${head}export const Route = createFileRoute('/')({ component: () => <p>v1</p> })`,
    )
    const after = transformWithRouteHmrPlugin(
      `${head}export const Route = createFileRoute('/')({
  pendingComponent: () => <p>pending</p>,
  errorComponent: () => <p>error</p>,
  component: () => <p>v2</p>,
})`,
    )
    expect(await expectRegisteredRouteOption(after, 'component')).toBe(
      await expectRegisteredRouteOption(before, 'component'),
    )
  })

  // Source: ReactFreshBabelPlugin-test "includes custom hooks into the signatures"
  it('with the hook signature of the component the user wrote, also in the split chunk', async () => {
    const declarations = `import { useState } from 'react'
const format = (n: number) => String(n)
function useCounter() {
  const [count] = useState(0)
  return format(count)
}`
    const component = `() => {
  const count = useCounter()
  return <p>{count}</p>
}`
    const { signatures } = await reactRefresh(
      `${declarations}\nconst Page = ${component}\nexport const Route = {}`,
    )
    const expected = signatures.get('Page')
    expect(expected).toBeDefined()
    // The loader shares `format` with the component's hook.
    const source = `${head}${declarations}
export const Route = createFileRoute('/')({
  loader: () => format(1),
  component: ${component},
})`

    const hmr = transformWithRouteHmrPlugin(source)
    const hoisted = await expectRegisteredRouteOption(hmr, 'component')
    expect((await reactRefresh(hmr)).signatures.get(hoisted)).toBe(expected)

    const modules = compileWithCodeSplitting(source)
    expect(modules.shared).toMatch(declarationOf('format'))
    const chunkSignatures = (await reactRefresh(modules['virtual component']!))
      .signatures
    expect([...chunkSignatures.values()]).toContain(expected)
  })
})

describe('React Refresh hoisting picks names nothing else uses', () => {
  it.each([
    [
      'a top-level const',
      `const TSRComponent = 'taken'`,
      `<p>{TSRComponent}</p>`,
    ],
    ['an import', `import { TSRComponent } from './taken'`, `<TSRComponent />`],
    [
      'a function declared after the route',
      ``,
      `<p>{TSRComponent()}</p>`,
      `\nfunction TSRComponent() { return 'taken' }`,
    ],
  ])('not a name held by %s', async (_, before, jsx, after = '') => {
    const code = transformWithRouteHmrPlugin(
      `${head}${before}
export const Route = createFileRoute('/')({ component: () => ${jsx} })${after}`,
    )
    // A reused name would redeclare the user's binding (an invalid module).
    const binding = await expectRegisteredRouteOption(code, 'component')
    expect(binding).not.toBe('TSRComponent')
  })

  it('nor a global the component reads', async () => {
    const code = transformWithRouteHmrPlugin(
      `${head}export const Route = createFileRoute('/')({
  component: () => <p>{typeof TSRPendingComponent}</p>,
  pendingComponent: () => <p>pending</p>,
})`,
    )
    const pending = await expectRegisteredRouteOption(code, 'pendingComponent')
    expect(pending).not.toBe('TSRPendingComponent')
    // `TSRPendingComponent` must stay an unresolved global inside `component`.
    expect(code).not.toMatch(declarationOf('TSRPendingComponent'))
  })
})

describe('React Refresh hoisting of inline route components', () => {
  it('hoists the root route component but not the components of routes a function creates', async () => {
    const { reference } = compileWithCodeSplitting(`
import { createRootRoute, createRoute } from '@tanstack/react-router'
export function makeChild(label: string) {
  return createRoute({
    getParentRoute: () => Route,
    path: label,
    component: () => <div>{label}</div>,
  })
}
export const Route = createRootRoute({ component: () => <div /> })
`)
    const program = parseModule(reference!)
    // `label` only exists inside `makeChild`; any other top-level statement
    // that mentions it reads an undefined global at render time.
    const statementsUsingLabel = program.body
      .map((statement) => reference!.slice(statement.start, statement.end))
      .filter(
        (statement) =>
          /\blabel\b/.test(statement) &&
          !statement.includes('function makeChild('),
      )
    expect(statementsUsingLabel).toEqual([])
    // React Refresh can only register components bound to top-level names.
    await expectRegisteredRouteOption(reference!, 'component')
  })

  it('declares hoisted components before the route that uses them', () => {
    // The lowercase `page`, declared in the same statement as `Route`, is
    // renamed for React Refresh as well.
    const { reference } = compileWithCodeSplitting(`
import { createRootRoute } from '@tanstack/react-router'
export const page = () => <div />, Route = createRootRoute({
  component: page,
  pendingComponent: () => <div />,
})
`)
    const program = parseModule(reference!)
    const { route, value } = getRouteOption(program, 'pendingComponent')
    expect(value.type).toBe('Identifier')
    const name = (value as ESTree.IdentifierReference).name
    const declaration = topLevelDeclarators(program).find(
      (declarator) => declaratorName(declarator) === name,
    )
    // A `const` used before its declaration throws a TDZ ReferenceError when
    // the route is created.
    expect(declaration).toBeDefined()
    expect(declaration!.start).toBeLessThan(route.start)
  })
})
