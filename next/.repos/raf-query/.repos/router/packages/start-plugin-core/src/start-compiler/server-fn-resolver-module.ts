import type { ServerFn } from './types'

interface GenerateServerFnResolverModuleOptions {
  serverFnsById: Record<string, ServerFn>
  includeClientReferencedCheck: boolean
  useStaticImports?: boolean
  /**
   * Keep each imported module on its manifest entry after the first call.
   * Only safe when modules cannot be hot-replaced (production builds).
   */
  memoizeModules?: boolean
}

export function generateServerFnResolverModule(
  opts: GenerateServerFnResolverModuleOptions,
): string {
  const staticImports: Array<string> = []
  const manifest = Object.entries(opts.serverFnsById)
    // Keep generated source stable for content-addressed caches.
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, fn], index) => {
      const moduleRef = `serverFnModule${index}`
      const filename = JSON.stringify(fn.extractedFilename)
      if (opts.useStaticImports) {
        staticImports.push(`import * as ${moduleRef} from ${filename}`)
      }
      const moduleAccess = opts.useStaticImports
        ? `module: ${moduleRef}`
        : `importer: () => import(${filename})`
      const clientReferenced = opts.includeClientReferencedCheck
        ? `,\n    isClientReferenced: ${fn.isClientReferenced ?? true}`
        : ''

      return `'${id}': {
    functionName: '${fn.functionName}',
    ${moduleAccess}${clientReferenced}
  }`
    })
    .join(',\n  ')

  const clientReferencedCheck = opts.includeClientReferencedCheck
    ? `
  if (access.origin === 'client' && !serverFnInfo.isClientReferenced) {
    throw new Error('Server function not accessible from client: ' + id)
  }
`
    : ''
  // Every import() goes through the ESM loader; a resolved production module
  // can be kept on the manifest entry instead.
  const resolveModule = opts.memoizeModules
    ? 'serverFnInfo.module ??= await serverFnInfo.importer()'
    : 'serverFnInfo.module ?? (await serverFnInfo.importer())'

  return `
${staticImports.join('\n')}
const manifest = {
  ${manifest}
}

export async function getServerFnById(id, access) {
  const serverFnInfo = manifest[id]
  if (!serverFnInfo) {
    throw new Error('Server function info not found for ' + id)
  }
${clientReferencedCheck}
  const fnModule = ${resolveModule}
  if (!fnModule) {
    throw new Error('Server function module not resolved for ' + id)
  }
  const action = fnModule[serverFnInfo.functionName]
  if (!action) {
    throw new Error('Server function module export not resolved for serverFn ID: ' + id)
  }
  return action
}

`
}
