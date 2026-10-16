import {
  Link,
  Outlet,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  linkOptions,
  retainSearchParams,
  stripSearchParams,
  useLocation,
} from '@tanstack/react-router'
import {
  LINK_COUNT,
  LOCALES,
  encodedValue,
  optionalCategory,
  sourceFilter,
  sourceSearch,
  splatValue,
} from '../cases'
import type { RouterHistory } from '@tanstack/history'
import type { SearchSchemaInput } from '@tanstack/react-router'
import type { Filter, LinkCaseId, LinkSearch } from '../cases'

interface StateUpdates {
  calls: number
  verifiedCalls: number
  input: number
  output: number
  offset: number
}

interface WorkloadContext {
  caseId: LinkCaseId
  stateUpdates: StateUpdates
}

function isFilter(value: unknown): value is Filter {
  return (
    typeof value === 'object' &&
    value !== null &&
    'tag' in value &&
    typeof value.tag === 'string' &&
    'flags' in value &&
    typeof value.flags === 'object' &&
    value.flags !== null &&
    'open' in value.flags &&
    typeof value.flags.open === 'boolean' &&
    'tags' in value &&
    Array.isArray(value.tags) &&
    value.tags.every((tag: unknown) => typeof tag === 'string')
  )
}

const rootRoute = createRootRouteWithContext<WorkloadContext>()({
  validateSearch: (
    search: Record<string, unknown> & SearchSchemaInput,
  ): LinkSearch => ({
    page: typeof search.page === 'number' ? search.page : undefined,
    tenant: typeof search.tenant === 'string' ? search.tenant : undefined,
    filter: isFilter(search.filter) ? search.filter : undefined,
  }),
  component: RootLayout,
})

const itemsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'items/$itemId',
})
const detailsRoute = createRoute({
  getParentRoute: () => itemsRoute,
  path: 'details',
})
const teamRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'teams/$teamId',
})
const teamItemRoute = createRoute({
  getParentRoute: () => teamRoute,
  path: '$itemId',
})
const teamDetailsRoute = createRoute({
  getParentRoute: () => teamItemRoute,
  path: 'details',
})
const filteredRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'filtered/$itemId',
  search: {
    middlewares: [
      retainSearchParams<LinkSearch>(['tenant']),
      stripSearchParams<LinkSearch>({ page: 1 }),
      ({ search, next }) => {
        const result = next(search)
        return {
          ...result,
          filter: result.filter
            ? { ...result.filter, tag: result.filter.tag.trim().toUpperCase() }
            : undefined,
        }
      },
    ],
  },
})
const numericRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'numbers/$number',
  params: {
    parse: ({ number }) => {
      const value = Number(number)
      if (!Number.isFinite(value)) {
        throw new Error(`Invalid number: ${number}`)
      }
      return { number: value }
    },
    stringify: ({ number }) => ({ number: String(number) }),
  },
})
const optionalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'optional/{-$category}/$itemId',
})
const splatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'files/$',
})
const encodedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'encoded/$value',
})
const publicRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'public/$itemId',
})

const routeTree = rootRoute.addChildren([
  itemsRoute.addChildren([detailsRoute]),
  teamRoute.addChildren([teamItemRoute.addChildren([teamDetailsRoute])]),
  filteredRoute,
  numericRoute,
  optionalRoute,
  splatRoute,
  encodedRoute,
  publicRoute,
])

const localeRewrite = {
  input: ({ url }: { url: URL }) => {
    const match = /^\/(en|fr|de|es)(\/.*)$/.exec(url.pathname)
    if (match) {
      url.pathname = match[2]!
      url.searchParams.set('tenant', match[1]!)
    }
    return url
  },
  output: ({ url }: { url: URL }) => {
    const locale = url.searchParams.get('tenant')
    if (locale) {
      url.searchParams.delete('tenant')
      url.pathname = `/${locale}${url.pathname}`
    }
    return url
  },
}

export function createLinkRouter(
  caseId: LinkCaseId,
  history: RouterHistory,
  isServer: boolean,
) {
  const context: WorkloadContext = {
    caseId,
    stateUpdates: {
      calls: 0,
      verifiedCalls: 0,
      input: 0,
      output: 0,
      offset: 0,
    },
  }
  return createRouter({
    routeTree,
    history,
    isServer,
    context,
    scrollRestoration: false,
    defaultPreload: false,
    trailingSlash: 'never',
    pathParamsAllowedCharacters:
      caseId === 'encoding' ? ['@', ':', '+'] : undefined,
    ...(caseId === 'rewrites'
      ? { basepath: '/app', rewrite: localeRewrite }
      : {}),
  })
}

export type LinkRouter = ReturnType<typeof createLinkRouter>

declare module '@tanstack/react-router' {
  interface Register {
    router: LinkRouter
  }
}

declare module '@tanstack/history' {
  interface HistoryState {
    linkPerfState?: number
  }
}

// Call alongside DOM assertions, outside the timed loop, after each sample.
export function assertStateUpdates(router: LinkRouter): void {
  const { caseId, stateUpdates } = router.options.context
  if (caseId !== 'location-updaters') {
    return
  }
  const input = router.state.location.state.linkPerfState ?? 0
  if (
    stateUpdates.calls - stateUpdates.verifiedCalls < LINK_COUNT ||
    stateUpdates.input !== input ||
    stateUpdates.output !== input + stateUpdates.offset ||
    stateUpdates.offset < 1 ||
    stateUpdates.offset > 40
  ) {
    throw new Error(
      'Link history-state updaters did not run with current state',
    )
  }
  stateUpdates.verifiedCalls = stateUpdates.calls
}

function sourceOptions(caseId: LinkCaseId, stateIndex: number) {
  const itemId = `item-${stateIndex}`
  const common = {
    search: sourceSearch(caseId, stateIndex),
    hash: caseId === 'location-updaters' ? `source-${stateIndex}` : '',
    state: { linkPerfState: stateIndex + 10 },
  }
  switch (caseId) {
    case 'relative':
      return linkOptions({
        ...common,
        to: '/teams/$teamId/$itemId',
        params: { teamId: `team-${stateIndex}`, itemId },
      })
    case 'numeric-params':
      return linkOptions({
        ...common,
        to: '/numbers/$number',
        params: { number: stateIndex },
      })
    case 'optional-params':
      return linkOptions({
        ...common,
        to: '/optional/{-$category}/$itemId',
        params: { category: optionalCategory(stateIndex), itemId },
      })
    case 'splats':
      return linkOptions({
        ...common,
        to: '/files/$',
        params: { _splat: `source/state-${stateIndex}` },
      })
    case 'encoding':
      return linkOptions({
        ...common,
        to: '/encoded/$value',
        params: { value: `source-${stateIndex}` },
      })
    case 'active':
      return linkOptions({
        ...common,
        to: '/items/$itemId/details',
        params: { itemId },
      })
    default:
      return linkOptions({
        ...common,
        to: '/items/$itemId',
        params: { itemId },
      })
  }
}

const indexes = Array.from({ length: LINK_COUNT }, (_, index) => index)
const controls = [0, 1, 2, 3] as const

function SourcePath() {
  const pathname = useLocation({ select: (location) => location.pathname })
  return <span data-testid="source-path">{pathname}</span>
}

function RootLayout() {
  const context = rootRoute.useRouteContext()
  return (
    <>
      <nav>
        {controls.map((stateIndex) => (
          <Link
            key={stateIndex}
            {...sourceOptions(context.caseId, stateIndex)}
            replace
            preload={false}
            resetScroll={false}
            hashScrollIntoView={false}
            data-testid={`go-state-${stateIndex}`}
          >
            State {stateIndex}
          </Link>
        ))}
      </nav>
      <SourcePath />
      <section aria-label="Measured Links">
        {indexes.map((index) => measuredLink(context, index))}
      </section>
      <Outlet />
    </>
  )
}

function measuredLink(
  { caseId, stateUpdates }: WorkloadContext,
  index: number,
) {
  const common = {
    key: index,
    'data-perf-link': index,
    preload: false,
    children: `Link ${index}`,
  } as const
  const itemId = `item-${index % 40}`
  switch (caseId) {
    case 'shared-params':
    case 'unique-params':
      return (
        <Link
          {...common}
          to="/items/$itemId"
          params={{
            itemId: caseId === 'unique-params' ? `item-${index}` : itemId,
          }}
        />
      )
    case 'param-updaters':
      return (
        <Link
          {...common}
          from="/items/$itemId"
          to="."
          params={(previous) => ({
            itemId: `${previous.itemId}-related-${index % 40}`,
          })}
        />
      )
    case 'location-updaters':
      return (
        <Link
          {...common}
          from="/items/$itemId"
          to="."
          params
          search={(previous) => ({
            ...previous,
            page: (previous.page ?? 1) + 1 + (index % 5),
          })}
          hash={(previous) => `${previous}-link-${index % 5}`}
          state={(previous) => {
            const input = previous.linkPerfState ?? 0
            const offset = (index % 40) + 1
            const output = input + offset
            stateUpdates.calls++
            stateUpdates.input = input
            stateUpdates.output = output
            stateUpdates.offset = offset
            return { ...previous, linkPerfState: output }
          }}
        />
      )
    case 'relative':
      return (
        <Link
          {...common}
          from="/teams/$teamId/$itemId"
          to={index % 2 === 0 ? '..' : './details'}
          params
          search
        />
      )
    case 'middleware':
      return (
        <Link
          {...common}
          to="/filtered/$itemId"
          params={{ itemId }}
          search={{
            page: index % 2 === 0 ? 1 : 2,
            filter: {
              ...sourceFilter(index % 4),
              tag: ` label-${index % 40} `,
            },
          }}
        />
      )
    case 'numeric-params':
      return (
        <Link
          {...common}
          from="/numbers/$number"
          to="."
          params={(previous) => ({ number: previous.number + (index % 40) })}
        />
      )
    case 'optional-params':
      return (
        <Link
          {...common}
          from="/optional/{-$category}/$itemId"
          to="."
          params={
            index % 3 === 0
              ? { itemId, category: 'fixed' }
              : index % 3 === 1
                ? { itemId }
                : { itemId, category: undefined }
          }
        />
      )
    case 'splats':
      return (
        <Link
          {...common}
          to="/files/$"
          params={{ _splat: splatValue(index) }}
        />
      )
    case 'encoding':
      return (
        <Link
          {...common}
          to="/encoded/$value"
          params={{ value: encodedValue(index) }}
        />
      )
    case 'masks':
      return (
        <Link
          {...common}
          to="/items/$itemId"
          params={{ itemId }}
          search={{ page: 2 }}
          mask={{
            to: '/public/$itemId',
            params: { itemId: `display-${index % 40}` },
            search: { tenant: `mask-${index % 4}` },
          }}
        />
      )
    case 'rewrites':
      return (
        <Link
          {...common}
          to="/items/$itemId"
          params={{ itemId }}
          search={{ tenant: LOCALES[index % 4], page: (index % 3) + 1 }}
        />
      )
    case 'active': {
      const item = Math.floor(index / 5)
      const variant = index % 5
      return (
        <Link
          {...common}
          to={variant < 2 ? '/items/$itemId' : '/items/$itemId/details'}
          params={{ itemId: `item-${item}` }}
          search={
            variant < 3
              ? { filter: sourceFilter(item % 4) }
              : {
                  ...sourceSearch('active', item % 4),
                  ...(variant === 4 ? { filter: undefined } : {}),
                }
          }
          activeOptions={{
            exact: variant === 1 || variant === 2 || variant === 3,
            includeSearch: variant !== 2,
            explicitUndefined: variant === 4,
          }}
          className="perf-link"
          style={{ color: 'black', opacity: 0.8 }}
          activeProps={() => ({
            className: 'perf-active',
            title: 'active',
            style: { color: 'green' },
          })}
          inactiveProps={() => ({
            className: 'perf-inactive',
            title: 'inactive',
            style: { color: 'gray' },
          })}
        >
          {({ isActive }) => `${index}:${isActive ? 'active' : 'inactive'}`}
        </Link>
      )
    }
  }
}
