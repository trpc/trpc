import { describe, expect, test } from 'vitest'
import { generateServerFnResolverModule } from '../src/start-compiler/server-fn-resolver-module'

const serverFnsById = {
  fn_a: {
    functionName: 'fnA',
    functionId: 'fn_a',
    extractedFilename: '/app/fn-a.ts',
    filename: '/app/fn-a.ts',
    isClientReferenced: true,
  },
}

describe('generateServerFnResolverModule', () => {
  test.each([false, true])(
    'resolves public exports and checks client access with static imports: %s',
    async (useStaticImports) => {
      const entry = {
        ...serverFnsById.fn_a,
        extractedFilename: `data:text/javascript,${encodeURIComponent(
          'export const fnA = () => "resolved"',
        )}`,
      }
      const source = generateServerFnResolverModule({
        serverFnsById: {
          fn_a: entry,
          fn_private: { ...entry, isClientReferenced: false },
        },
        includeClientReferencedCheck: true,
        memoizeModules: true,
        useStaticImports,
      })
      const { getServerFnById } = await import(
        /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(source)}`
      )
      const action = await getServerFnById('fn_a', { origin: 'client' })
      expect(action()).toBe('resolved')
      await expect(
        getServerFnById('fn_private', { origin: 'client' }),
      ).rejects.toThrow('Server function not accessible from client')
      await expect(
        getServerFnById('fn_private', { origin: 'server' }),
      ).resolves.toBe(action)
      await expect(
        getServerFnById('missing', { origin: 'server' }),
      ).rejects.toThrow('Server function info not found')
    },
  )

  test('imports on every call by default', () => {
    const source = generateServerFnResolverModule({
      serverFnsById,
      includeClientReferencedCheck: false,
    })
    expect(source).toContain(
      'serverFnInfo.module ?? (await serverFnInfo.importer())',
    )
    expect(source).not.toContain('??=')
  })

  test('keeps the imported module when memoizeModules is set', () => {
    const source = generateServerFnResolverModule({
      serverFnsById,
      includeClientReferencedCheck: false,
      memoizeModules: true,
    })
    expect(source).toContain(
      'serverFnInfo.module ??= await serverFnInfo.importer()',
    )
  })
})
