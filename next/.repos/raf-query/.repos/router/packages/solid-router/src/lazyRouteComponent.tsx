import { Dynamic } from 'solid-js/web'
import { lazy } from 'solid-js'
import { isModuleNotFoundError } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import type { AsyncRouteComponent } from './route'

export function lazyRouteComponent<
  T extends Record<string, any>,
  TKey extends keyof T = 'default',
>(
  importer: () => Promise<T>,
  exportName?: TKey,
): T[TKey] extends (props: infer TProps) => any
  ? AsyncRouteComponent<TProps>
  : never {
  let loadPromise: Promise<any> | undefined
  let comp: T[TKey] | T['default']
  let error: any

  const load = () => {
    if (!loadPromise) {
      error = undefined
      loadPromise = importer()
        .then((res) => {
          // Resolved clients have no preload work; SSR can reuse the import.
          if (!(isServer ?? typeof window === 'undefined')) {
            loadPromise = undefined
            ;(Lazy as any).preload = undefined
          }
          comp = res[exportName ?? 'default']
          return comp
        })
        .catch((err) => {
          loadPromise = undefined
          error = err
        })
    }

    return loadPromise
  }
  function Lazy(props: any) {
    if (comp || error) {
      return render(props)
    }

    return <Loadable {...props} />
  }

  // Both preload and lazy resolution end here without starting another load.
  function render(props: any) {
    // Now that we're out of preload and into actual render path,
    // throw the error if it was a module not found error during preload
    if (error) {
      // If the load fails due to module not found, it may mean a new version of
      // the build was deployed and the user's browser is still using an old version.
      // If this happens, the old version in the user's browser would have an outdated
      // URL to the lazy module.
      // In that case, we want to attempt one window refresh to get the latest.
      if (isModuleNotFoundError(error)) {
        // We don't want an error thrown from preload in this case, because
        // there's nothing we want to do about module not found during preload.
        // Record the error, recover the promise with a null return,
        // and we will attempt module not found resolution during the render path.

        if (
          error instanceof Error &&
          typeof window !== 'undefined' &&
          typeof sessionStorage !== 'undefined'
        ) {
          // Again, we want to reload one time on module not found error and not enter
          // a reload loop if there is some other issue besides an old deploy.
          // That's why we store our reload attempt in sessionStorage.
          // Use error.message as key because it contains the module path that failed.
          const storageKey = `tanstack_router_reload:${error.message}`
          if (!sessionStorage.getItem(storageKey)) {
            sessionStorage.setItem(storageKey, '1')
            window.location.reload()

            // Return no content while we wait for window to reload.
            return null
          }
        }
      }

      // Otherwise, just throw the error
      throw error
    }

    return <Dynamic component={comp} {...props} />
  }

  const Loadable = lazy(async () => {
    await load()
    if (process.env.NODE_ENV !== 'production' && !comp && !error) {
      throw new Error(
        `lazyRouteComponent: export "${String(exportName ?? 'default')}" not found`,
      )
    }
    return { default: render }
  })

  ;(Lazy as any).preload = load

  return Lazy as any
}
