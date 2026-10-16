import * as Vue from 'vue'
import { isNotFound } from '@tanstack/router-core'
import { useSelector } from '@tanstack/vue-store'
import { CatchBoundary } from './CatchBoundary'
import { useRouter } from './useRouter'
import type { ErrorComponentProps, NotFoundError } from '@tanstack/router-core'

export const CatchNotFound = Vue.defineComponent({
  name: 'CatchNotFound',
  inheritAttrs: false,
  props: {
    fallback: Function as Vue.PropType<(error: NotFoundError) => Vue.VNode>,
    onCatch: Function as Vue.PropType<(error: NotFoundError) => void>,
    children: {
      type: Object as Vue.PropType<Vue.VNode>,
      required: true,
    },
  },
  setup(props) {
    const router = useRouter()
    // TODO: Some way for the user to programmatically reset the not-found boundary?
    const pathname = useSelector(
      router.stores.location,
      (location) => location.pathname,
    )
    const status = useSelector(router.stores.status)

    // Create a function that returns a VNode to match the SyncRouteComponent signature
    const errorComponentFn = (componentProps: ErrorComponentProps) => {
      const error = componentProps.error

      if (isNotFound(error)) {
        // If a fallback is provided, use it
        if (props.fallback) {
          return props.fallback(error)
        }
        // Otherwise return a default not found message
        return Vue.h('p', null, 'Not Found')
      } else {
        // Re-throw non-NotFound errors
        throw error
      }
    }

    return () =>
      Vue.h(CatchBoundary, {
        getResetKey: () => `not-found-${pathname.value}-${status.value}`,
        onCatch: (error: unknown) => {
          if (isNotFound(error)) {
            if (props.onCatch) {
              props.onCatch(error)
            }
          } else {
            throw error
          }
        },
        errorComponent: errorComponentFn,
        children: props.children,
      })
  },
})

export const DefaultGlobalNotFound = Vue.defineComponent({
  name: 'DefaultGlobalNotFound',
  setup() {
    return () => Vue.h('p', null, 'Not Found')
  },
})
