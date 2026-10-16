import { runInNewContext } from 'node:vm'
import { attachRouterServerSsrUtils } from '@tanstack/router-core/ssr/server'
import type { AnyRouter } from '@tanstack/router-core'
import type { TsrSsrGlobal } from '@tanstack/router-core/ssr/client'

export async function dehydrateToBootstrap(
  router: AnyRouter,
): Promise<TsrSsrGlobal> {
  try {
    attachRouterServerSsrUtils({ router, manifest: { routes: {} } })
    await router.load()
    await router.serverSsr!.dehydrate()

    const scripts = router.serverSsr!.takeInitialHydrationScriptTags()
    if (!scripts?.before.length) {
      throw new Error(
        'Expected server dehydration to produce a bootstrap script',
      )
    }

    const context: {
      document: { currentScript: { remove: () => void } }
      self?: unknown
      $_TSR?: TsrSsrGlobal
    } = {
      document: {
        currentScript: {
          remove() {},
        },
      },
    }
    context.self = context
    for (const script of scripts.before) {
      runInNewContext(script.children!, context)
    }

    if (!context.$_TSR) {
      throw new Error('Expected bootstrap script to initialize $_TSR')
    }
    return context.$_TSR
  } catch (error) {
    router.serverSsr?.cleanup()
    throw error
  }
}
