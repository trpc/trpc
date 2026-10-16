import { transformWithOxc } from 'vite'
import { describe, expect, it } from 'vitest'
import {
  compileRouteModules,
  componentChunk,
  declarationOf,
  evaluateModule,
  expectValidModules,
  exportedNames,
  head,
  importSources,
  importedNames,
  transformWithRouteHmrPlugin,
} from './regression-helpers'

describe('each module imports only the specifiers it reads', () => {
  // Source: React Router route-chunks-test.ts "functions referencing their own
  // identifiers"; babel-dead-code-elimination dead-code-elimination.test.ts
  // "import" > "mixed default and named" and "namespace"
  it('splits default, named and namespace specifiers between the modules', async () => {
    const { modules, sharedBindings } =
      compileRouteModules(`${head}import defaultMessage, { targetMessage, otherMessage } from './messages'
import * as messages from './messages'
import other, * as ns from './other'
const getDefault = () => defaultMessage
const getTarget = () => targetMessage
const getOther = () => otherMessage
function getNamespaced() {
  return messages.namespaced
}
export const Route = createFileRoute('/')({
  loader: () => [getOther(), other],
  component: () => <div>{getDefault()}{ns.x}</div>,
  errorComponent: () => <div>{getNamespaced()}</div>,
  notFoundComponent: () => <div>{getTarget()}</div>,
})
`)
    expect(sharedBindings).toEqual([])
    const imports = (module: string, source: string) =>
      importedNames(modules[module]!, source)
    expect(imports('reference', './messages')).toEqual(['otherMessage'])
    expect(imports('reference', './other')).toEqual(['default'])
    expect(imports('virtual component', './messages')).toEqual(['default'])
    expect(imports('virtual component', './other')).toEqual(['*'])
    expect(imports('virtual errorComponent', './messages')).toEqual(['*'])
    expect(imports('virtual notFoundComponent', './messages')).toEqual([
      'targetMessage',
    ])
    await expectValidModules(modules)
  })

  it('moves a specifier with a string name into the chunk', async () => {
    const { modules } =
      compileRouteModules(`${head}import { "kebab-name" as Kebab } from './icons'
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <Kebab />,
})
`)
    expect(importedNames(modules['virtual component']!, './icons')).toEqual([
      'kebab-name',
    ])
    expect(importSources(modules.reference!)).not.toContain('./icons')
    await expectValidModules(modules)
  })

  // Source: babel-dead-code-elimination dead-code-elimination.test.ts "import" >
  // "mixed default and named: none used" and "side-effect"
  it('removes an import whose specifiers all moved instead of leaving a side-effect import', async () => {
    const code = `${head}import a, { b } from 'pkg'
import './styles.css'
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{a}{b}</p>,
})
`
    const { modules } = compileRouteModules(code)
    // React HMR rewrites the reference module before unused code is removed.
    const hmrReference = compileRouteModules(code, { hmr: true }).modules
      .reference!
    for (const reference of [modules.reference!, hmrReference]) {
      expect(importSources(reference)).toContain('./styles.css')
      expect(importSources(reference)).not.toContain('pkg')
    }
    expect(importedNames(modules['virtual component']!, 'pkg')).toEqual([
      'b',
      'default',
    ])
    await expectValidModules(modules)
  })

  // With React's classic JSX runtime (`jsx: "react"` in tsconfig), JSX
  // compiles to `React.createElement`, so a React import that the TypeScript
  // code only uses in types must stay.
  it.each([
    { name: 'split chunk', compile: componentChunk },
    {
      name: 'route module compiled for HMR',
      compile: (code: string) => transformWithRouteHmrPlugin(code),
    },
  ])(
    'keeps the React import of the $name for classic JSX',
    async ({ compile }) => {
      const output = compile(`import * as React from 'react'
${head}function Page({ title = 'classic' }: { title?: React.ReactNode }) {
  return <p>{title}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`)
      const { code } = await transformWithOxc(output, 'module.tsx', {
        jsx: { runtime: 'classic' },
      })
      expect(importedNames(code, 'react')).toEqual(['*'])
    },
  )
})

describe('exports of the route file', () => {
  it.each([
    { name: 'as-is', exports: 'export { Foo }' },
    { name: 'renamed', exports: 'export { Foo as Bar }' },
  ])(
    'are not redeclared when they re-export an import $name',
    async ({ exports }) => {
      const { modules } =
        compileRouteModules(`${head}import { Foo } from './foo'
${exports}
export const Route = createFileRoute('/')({ component: Page })
function Page() {
  return <Foo />
}
`)
      await expectValidModules(modules)
    },
  )

  it('are not redeclared when destructured next to a non-exported binding', async () => {
    const { modules } = compileRouteModules(`${head}const { a, b } = getStuff()
export { a }
export const Route = createFileRoute('/')({
  component: () => <div>{a}{b}</div>,
})
`)
    await expectValidModules(modules)
  })

  it.each([
    { name: 'function', declaration: 'function () {\n  return null\n}' },
    { name: 'class', declaration: 'class {\n  x = 1\n}' },
  ])(
    'keep an anonymous default-exported $name valid in every module',
    async ({ declaration }) => {
      const { modules } = compileRouteModules(`${head}const cache = new Map()
function Page() {
  return <div>{cache.size}</div>
}
export const Route = createFileRoute('/')({
  loader: () => cache.get('x'),
  component: Page,
})
export default ${declaration}
`)
      expect(Object.keys(modules)).toContain('shared')
      await expectValidModules(modules)
    },
  )

  // Source: Next.js ssg/getStaticProps/issue-31855 and multi-declarator-export
  it('are imported by the chunk when declared in one statement', async () => {
    const { modules } = compileRouteModules(`${head}export const a = 1,
  b = 2
export const Route = createFileRoute('/')({
  component: () => <div>{a + b}</div>,
})
`)
    expect(exportedNames(modules.reference!)).toEqual(['Route', 'a', 'b'])
    const chunk = modules['virtual component']!
    // From the route module, or from the shared module the route module
    // re-exports them from.
    expect(
      [
        ...importedNames(chunk, 'route.tsx'),
        ...importedNames(chunk, 'route.tsx?tsr-shared=1'),
      ].sort(),
    ).toEqual(['a', 'b'])
    expect(chunk).not.toMatch(declarationOf('a'))
    expect(chunk).not.toMatch(declarationOf('b'))
    await expectValidModules(modules)
  })

  it('keep module-level re-exports in the reference module', async () => {
    const { modules } = compileRouteModules(`${head}export * from './lib'
export * as lib from './lib'
export {}
const cache = new Map()
export const Route = createFileRoute('/')({
  loader: () => cache.size,
  component: () => <div>{cache.size}</div>,
})
`)
    expect(modules.reference).toMatch(/export \* from ['"]\.\/lib['"]/)
    expect(modules.reference).toMatch(/export \* as lib from ['"]\.\/lib['"]/)
    await expectValidModules(modules)
  })
})

describe('TypeScript-only syntax', () => {
  it('erases type-only imports and exports from the split modules', async () => {
    const { modules } =
      compileRouteModules(`${head}import type { User } from './types'
import { type Settings, defaults } from './settings'
export type * from './types'
export type { User }
const current: User | Settings = defaults
export const Route = createFileRoute('/')({
  loader: () => current,
  component: () => <div>{String(current)}</div>,
})
`)
    expect(importedNames(modules['virtual component']!, './types')).toEqual([])
    expect(importedNames(modules.shared!, './types')).toEqual([])
    expect(importedNames(modules.shared!, './settings')).toEqual(['defaults'])
    await expectValidModules(modules)
  })

  // Ambient declarations (`declare ...`) have no runtime binding: the
  // environment provides the value (a <script> tag, a bundler define, a global).
  it.each([
    {
      name: 'a declare function',
      declaration: 'declare function track(event: string): void',
      use: 'track("x")',
    },
    {
      name: 'an exported declare function',
      declaration: 'export declare function track(event: string): void',
      use: 'track("x")',
    },
    {
      name: 'a declare enum',
      declaration: 'declare enum Flags { On = 1 }',
      use: 'Flags.On',
    },
    {
      name: 'a declare namespace',
      declaration:
        'declare namespace Analytics { function track(event: string): void }',
      use: 'Analytics.track("x")',
    },
  ])(
    'does not share $name that the loader and the component read',
    async ({ declaration, use }) => {
      const { modules, sharedBindings } =
        compileRouteModules(`${head}${declaration}
export const Route = createFileRoute('/ambient')({
  loader: () => ${use},
  component: () => <button onClick={() => ${use}}>track</button>,
})
`)
      expect(sharedBindings).toEqual([])
      await expectValidModules(modules)
    },
  )

  it('keeps the namespace import that an import alias refers to', () => {
    const chunk = componentChunk(`${head}import * as lib from './lib'
import Helper = lib.Helper
export const Route = createFileRoute('/')({
  component: () => <div>{Helper.x}</div>,
})
`)
    expect(importedNames(chunk, './lib')).toEqual(['*'])
    expect(chunk).toMatch(/\bHelper\s*=\s*lib\.Helper\b/)
  })

  // Source: Qwik optimizer test.rs example_ts_enums, example_exports
  it('gives the split component the enum and the overloaded function it uses', async () => {
    const { modules } = compileRouteModules(`${head}enum Tone { Loud = 'LOUD' }
function label(value: string): string
function label(value: unknown) { return 'label:' + String(value) }
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{[Tone.Loud, label('x')].join('|')}</p>,
})
`)
    await expectValidModules(modules)
    const chunk = await evaluateModule(modules['virtual component']!)
    expect(chunk.component!()).toBe('<p>LOUD|label:x</p>')
  })

  // TypeScript lets a type and a value share a name; exporting both is valid.
  it.each([
    {
      name: 'a type alias and an export specifier',
      exports: `export type Post = { id: string }
function Post(id: string): Post {
  return { id }
}
export { Post }`,
    },
    {
      name: 'a type re-export and a value re-export',
      exports: `export type { Post } from './post-types'
export { Post } from './post-values'`,
    },
  ])(
    'exports a type and a value with the same name: $name',
    async ({ exports }) => {
      const code = `${head}${exports}
export const Route = createFileRoute('/posts')({
  component: () => <p>posts</p>,
})
`
      const { modules } = compileRouteModules(code)
      expect(exportedNames(modules.reference!)).toContain('Post')
      expect(exportedNames(transformWithRouteHmrPlugin(code))).toContain('Post')
      await expectValidModules(modules)
    },
  )

  it('keeps decorators before `export` for legacy decorator transforms', () => {
    // TypeScript `experimentalDecorators` and Babel `decorators-legacy` only
    // accept decorators before the `export` keyword.
    const { reference } =
      compileRouteModules(`${head}@observable export class Store { @observable count = 0 }
export const Route = createFileRoute('/')({ component: () => <div /> })
`).modules
    expect(reference).toMatch(/@observable\s+export class Store\b/)
  })
})
