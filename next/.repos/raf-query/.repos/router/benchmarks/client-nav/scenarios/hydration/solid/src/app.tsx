import { For, onMount } from 'solid-js'
import { HydrationScript } from 'solid-js/web'
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/solid-router'
import {
  clientUrl,
  hashLinkCount,
  ordinaryLinkCount,
  serverUrl,
} from '../fixture'
import type { JSX } from 'solid-js'
import type { Diagnostics } from '../fixture'

export function createFixtureRouter(server: boolean, diagnostics: Diagnostics) {
  function beforeLoad() {
    diagnostics.beforeLoads++
    if (!server) {
      throw new Error('Hydration reran beforeLoad instead of restoring context')
    }
  }

  function loader() {
    diagnostics.loaders++
    if (!server) {
      throw new Error('Hydration reran a loader instead of restoring data')
    }
  }

  const root = createRootRoute({
    beforeLoad: () => {
      beforeLoad()
      return { viewer: { id: 'viewer-3', name: 'Ada', role: 'editor' } }
    },
    head: () => ({
      meta: [{ charset: 'utf-8' }, { title: 'Hydration benchmark' }],
    }),
    shellComponent: Document,
  })
  const team = createRoute({
    getParentRoute: () => root,
    path: '/teams/$teamId',
    beforeLoad: ({ context, params }) => {
      beforeLoad()
      return { team: { id: params.teamId, member: context.viewer.id } }
    },
    loader: ({ context }) => {
      loader()
      return {
        title: `Team ${context.team.id}`,
        categories: ['open', 'closed'],
      }
    },
    component: Team,
  })
  const items = createRoute({
    getParentRoute: () => team,
    path: 'items/$itemId',
    validateSearch: (search: Record<string, unknown>) => ({
      view: search.view === 'details' ? 'details' : 'summary',
    }),
    beforeLoad: ({ context }) => {
      beforeLoad()
      return { permissions: { edit: context.viewer.role === 'editor' } }
    },
    loader: ({ context, params }) => {
      loader()
      return {
        selected: params.itemId,
        owner: context.team.member,
        rows: Array.from({ length: ordinaryLinkCount }, (_, index) => ({
          id: `item-${index}`,
          label: `Item ${index}`,
          details: { score: index * 3, open: index % 2 === 0 },
        })),
      }
    },
    component: Items,
  })

  function Document(props: { children: JSX.Element }) {
    return (
      <html lang="en">
        <head>
          <HydrationScript />
        </head>
        <body>
          <HeadContent />
          {props.children}
          <Scripts />
        </body>
      </html>
    )
  }

  function Team() {
    const context = team.useRouteContext()
    const data = team.useLoaderData()
    return (
      <main id="hydration-content">
        <h1>{data().title}</h1>
        <p id="viewer">{context().viewer.name}</p>
        <Outlet />
      </main>
    )
  }

  function Items() {
    const data = items.useLoaderData()
    const context = items.useRouteContext()
    onMount(() => {
      diagnostics.mounted = true
    })
    return (
      <>
        <p id="permission">
          {context().permissions.edit ? 'Editable' : 'Read only'}
        </p>
        <button
          id="interactive"
          onClick={() => {
            diagnostics.clicks++
          }}
        >
          Ready
        </button>
        <table>
          <tbody>
            <For each={data().rows}>
              {(row) => (
                <tr>
                  <td>{row.id}</td>
                  <td>{row.details.score}</td>
                  <td>
                    <Link
                      id={`ordinary-${row.id}`}
                      to="/teams/$teamId/items/$itemId"
                      params={{ teamId: context().team.id, itemId: row.id }}
                      search={{ view: 'summary' }}
                      preload={false}
                    >
                      {diagnostics.countUpdates
                        ? (state) => {
                            // Read the getter so this unit-only probe observes
                            // Link reactivity, rather than component execution.
                            void state.isActive
                            diagnostics.ordinaryEvaluations++
                            return row.label
                          }
                        : row.label}
                    </Link>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <nav>
          <For
            each={Array.from({ length: hashLinkCount }, (_, index) => index)}
          >
            {(index) => (
              <Link
                id={`hash-${index}`}
                to="/teams/$teamId/items/$itemId"
                params={{ teamId: context().team.id, itemId: data().selected }}
                search={{ view: 'summary' }}
                hash={index % 2 === 0 ? 'details' : 'other'}
                activeOptions={{ includeHash: true }}
                preload={false}
              >
                {diagnostics.countUpdates
                  ? (state) => {
                      const active = state.isActive
                      diagnostics.hashEvaluations++
                      diagnostics.initialHashStates[index] ??= active
                      diagnostics.hashStates[index] = active
                      return `Section ${index}`
                    }
                  : `Section ${index}`}
              </Link>
            )}
          </For>
        </nav>
        <section id="details">Details</section>
      </>
    )
  }

  return createRouter({
    routeTree: root.addChildren([team.addChildren([items])]),
    history: createMemoryHistory({
      initialEntries: [server ? serverUrl : clientUrl],
    }),
    isServer: server,
    scrollRestoration: false,
    defaultHashScrollIntoView: false,
    defaultPreload: false,
  })
}

declare module '@tanstack/solid-router' {
  interface Register {
    router: ReturnType<typeof createFixtureRouter>
  }
}
