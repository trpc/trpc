import { transformWithOxc } from 'vite'
import { describe, expect, it } from 'vitest'
import {
  compileRouteModules,
  componentChunk,
  head,
  transformWithRouteHmrPlugin,
} from './regression-helpers'

const styledRoute = (
  header: string,
) => `${header}export const Route = createFileRoute('/pragma')({
  component: () => <div css={{ color: 'red' }}>styled</div>,
})
`

/** Compiles JSX like Vite 8 (Oxc) does, with React's automatic runtime by default. */
async function compileJsx(code: string) {
  const { code: javascript } = await transformWithOxc(code, 'chunk.tsx', {
    jsx: { runtime: 'automatic', importSource: 'react' },
  })
  return javascript
}

/** The JSX runtime module a compiled module imports, if any. */
async function jsxRuntimeOf(code: string) {
  return (await compileJsx(code)).match(
    /from ["']([^"']+\/jsx-(?:dev-)?runtime)["']/,
  )?.[1]
}

// JSX pragmas apply per module: the code splitter runs before the bundler's
// JSX transform, which then runs on each split module separately, so a module
// without the pragma compiles its JSX with the project default runtime (e.g.
// `css` props are no longer handled by Emotion).
describe('split modules keep file-level JSX pragmas', () => {
  it.each([
    ['on the first import', `/** @jsxImportSource @emotion/react */\n${head}`],
    ['as a line comment', `// @jsxImportSource @emotion/react\n${head}`],
    [
      'inside a file header',
      `/**\n * Header\n * @jsxImportSource @emotion/react\n */\n${head}`,
    ],
  ])('keeps @jsxImportSource %s in effect', async (_, header) => {
    const chunk = componentChunk(styledRoute(header))
    expect(chunk).toContain('@jsxImportSource @emotion/react')
    expect(await jsxRuntimeOf(chunk)).toBe('@emotion/react/jsx-runtime')
  })

  it('keeps @jsxImportSource written after the imports', () => {
    // Oxc only reads leading pragmas; esbuild and Babel read them anywhere.
    const chunk = componentChunk(
      styledRoute(`${head}/** @jsxImportSource @emotion/react */\n`),
    )
    expect(chunk).toContain('@jsxImportSource @emotion/react')
  })

  it('keeps @jsxRuntime classic and @jsx pragmas in effect', async () => {
    const chunk = componentChunk(
      styledRoute(`/** @jsxRuntime classic */
/** @jsx jsx */
${head}import { jsx } from '@emotion/react'
`),
    )
    expect(await jsxRuntimeOf(chunk)).toBeUndefined()
    expect(await compileJsx(chunk)).toMatch(/\bjsx\(\s*["']div["']/)
  })

  it('keeps the pragma in effect in a shared module that contains JSX', async () => {
    const { shared } =
      compileRouteModules(`/** @jsxImportSource @emotion/react */
${head}const icon = <svg css={{ width: 1 }} />
export const Route = createFileRoute('/pragma')({
  loader: () => ({ icon }),
  component: () => <div css={{ color: 'red' }}>{icon}</div>,
})
`).modules
    expect(await jsxRuntimeOf(shared!)).toBe('@emotion/react/jsx-runtime')
  })
})

// React Refresh and solid-refresh read these comments per module, so every
// module holding route code must keep them.
describe('split modules keep HMR pragma comments', () => {
  const solidHead = `import { createFileRoute } from '@tanstack/solid-router'\n`
  const page = `function Page() {
  return <p>page</p>
}
export const Route = createFileRoute('/')({ component: Page })
`
  it.each([
    {
      // Source: React Refresh ReactFreshIntegration-test "resets state on every
      // edit with @refresh reset annotation"
      name: 'a /* @refresh reset */ file header for React Refresh',
      target: 'react',
      code: `/* @refresh reset */\n${head}${page}`,
      pragma: '@refresh reset',
    },
    {
      // Source: solid-refresh tests/client/vite.test.ts "@refresh reload should work"
      name: 'a // @refresh reload file header for solid-refresh',
      target: 'solid',
      code: `// @refresh reload\n${solidHead}${page}`,
      pragma: '@refresh reload',
    },
    {
      // Source: solid-refresh tests/client/vite.test.ts "should skip
      // FunctionDeclaration with @refresh reload"
      name: 'a // @refresh reload comment above the split component',
      target: 'solid',
      code: `${solidHead}// @refresh reload\n${page}`,
      pragma: '@refresh reload',
    },
  ] as const)('keeps $name', ({ target, code, pragma }) => {
    expect(transformWithRouteHmrPlugin(code, { target })).toContain(pragma)
    const { modules } = compileRouteModules(code, {
      hmr: true,
      targetFramework: target,
    })
    expect(modules.reference).toContain(pragma)
    expect(modules['virtual component']).toContain(pragma)
  })
})
