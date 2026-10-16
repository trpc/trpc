import * as Vue from 'vue'

export type NonRouteComponent =
  | 'pendingComponent'
  | 'errorComponent'
  | 'notFoundComponent'

export const nonRouteComponentContext =
  process.env.NODE_ENV !== 'production'
    ? (Symbol('nonRouteComponentContext') as Vue.InjectionKey<
        Vue.ComputedRef<NonRouteComponent>
      >)
    : undefined

const NonRouteComponentContextProvider =
  process.env.NODE_ENV !== 'production'
    ? Vue.defineComponent({
        name: 'NonRouteComponentContextProvider',
        props: {
          value: {
            type: String as Vue.PropType<NonRouteComponent>,
            required: true,
          },
        },
        setup(props, { slots }) {
          Vue.provide(
            nonRouteComponentContext!,
            Vue.computed(() => props.value),
          )
          return () => slots.default?.()
        },
      })
    : undefined

export function renderInNonRouteComponentContext(
  component: Vue.Component,
  props: Record<string, any> | undefined,
  context: NonRouteComponent,
): Vue.VNode {
  return Vue.h(
    NonRouteComponentContextProvider!,
    { value: context },
    { default: () => Vue.h(component, props) },
  )
}
