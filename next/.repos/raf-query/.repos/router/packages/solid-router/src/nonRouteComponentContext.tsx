import * as Solid from 'solid-js'

export type NonRouteComponent =
  | 'pendingComponent'
  | 'errorComponent'
  | 'notFoundComponent'

export const nonRouteComponentContext =
  process.env.NODE_ENV !== 'production'
    ? /* @__PURE__ */ Solid.createContext<NonRouteComponent>()
    : undefined

export function renderInNonRouteComponentContext(
  render: () => Solid.JSX.Element,
  component: NonRouteComponent,
) {
  const Context = nonRouteComponentContext!
  return <Context.Provider value={component}>{render()}</Context.Provider>
}
