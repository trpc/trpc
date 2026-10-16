import * as Solid from 'solid-js'

import { TSR_DEFERRED_PROMISE, defer } from '@tanstack/router-core'
import type { DeferredPromise } from '@tanstack/router-core'
import type { SolidNode } from './route'

export type AwaitOptions<T> = {
  promise: Promise<T>
}

export function useAwaited<T>({
  promise: _promise,
}: AwaitOptions<T>): [data: T, promise: DeferredPromise<T>] {
  const promise = defer(_promise)

  if (promise[TSR_DEFERRED_PROMISE].status === 'pending') {
    throw promise
  }

  if (promise[TSR_DEFERRED_PROMISE].status === 'error') {
    throw promise[TSR_DEFERRED_PROMISE].error
  }

  return [promise[TSR_DEFERRED_PROMISE].data, promise]
}

export function Await<T>(
  props: AwaitOptions<T> & {
    fallback?: SolidNode
    children: (result: T) => SolidNode
  },
) {
  if (!('fallback' in props)) {
    return <AwaitInner {...props} />
  }

  return (
    <Solid.Suspense fallback={props.fallback}>
      <AwaitInner {...props} />
    </Solid.Suspense>
  )
}

function AwaitInner<T>(
  props: AwaitOptions<T> & {
    fallback?: SolidNode
    children: (result: T) => SolidNode
  },
) {
  const [resource] = Solid.createResource(
    () => defer(props.promise),
    async (promise) => ({ value: await promise }),
  )

  return (
    <Solid.Show when={resource()}>
      {(result) => props.children(result().value)}
    </Solid.Show>
  )
}
