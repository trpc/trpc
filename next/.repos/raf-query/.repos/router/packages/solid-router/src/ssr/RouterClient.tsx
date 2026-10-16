import { hydrate } from '@tanstack/router-core/ssr/client'
import { Await } from '../awaited'
import { HeadContent } from '../HeadContent'
import { RouterProvider } from '../RouterProvider'
import type { AnyRouter } from '@tanstack/router-core'
import type { JSXElement } from 'solid-js'

let hydrationPromise: Promise<void> | undefined

const Dummy = (props: { children?: JSXElement }) => <>{props.children}</>

export function RouterClient(props: { router: AnyRouter }) {
  hydrationPromise ??= hydrate(props.router).finally(() => window.$_TSR!.h())

  return (
    <Await
      promise={hydrationPromise.then(() => true)}
      children={() => (
        <Dummy>
          <Dummy>
            <RouterProvider
              router={props.router}
              InnerWrap={(props) => (
                <Dummy>
                  <Dummy>
                    <HeadContent />
                    {props.children}
                  </Dummy>
                  <Dummy />
                </Dummy>
              )}
            />
          </Dummy>
        </Dummy>
      )}
    />
  )
}
