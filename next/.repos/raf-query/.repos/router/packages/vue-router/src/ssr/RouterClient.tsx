import * as Vue from 'vue'
import { hydrate } from '@tanstack/router-core/ssr/client'
import { HeadContent } from '../HeadContent'
import { RouterProvider } from '../RouterProvider'
import type { AnyRouter } from '@tanstack/router-core'

let hydrationPromise: Promise<void> | undefined

export const RouterClient = Vue.defineComponent({
  name: 'RouterClient',
  props: {
    router: {
      type: Object as () => AnyRouter,
      required: true,
    },
  },
  setup(props) {
    const isHydrated = Vue.ref(false)

    hydrationPromise ??= hydrate(props.router).finally(() => window.$_TSR!.h())

    Vue.onMounted(() => {
      return hydrationPromise!.then(() => {
        isHydrated.value = true
      })
    })

    return () => {
      if (!isHydrated.value) {
        return null
      }

      return Vue.h(
        RouterProvider,
        {
          router: props.router,
        },
        {
          innerWrap: (innerProps: { children: any }) => [
            Vue.h(HeadContent),
            innerProps.children,
          ],
        },
      )
    }
  },
})
