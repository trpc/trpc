import { hydrate } from '@tanstack/router-core/ssr/client'
import { Await } from '../awaited'
import { RouterProvider } from '../RouterProvider'
import type { AnyRouter } from '@tanstack/router-core'

let hydrationPromise: Promise<void> | undefined

export function RouterClient(props: { router: AnyRouter }) {
  hydrationPromise ??= hydrate(props.router).finally(() => window.$_TSR!.h())

  return (
    <Await
      promise={hydrationPromise}
      children={() => <RouterProvider router={props.router} />}
    />
  )
}
