import {
  createBrowserHistory,
  normalizeProtocolRelative,
  parseHref,
} from '@tanstack/history'
import { isServer, loadServerRoute } from '@tanstack/router-core/isServer'
import {
  DEFAULT_PROTOCOL_ALLOWLIST,
  createNull,
  decodePath,
  deepEqual,
  encodePathLikeUrl,
  findLast,
  functionalUpdate,
  getUrlScheme,
  hasKeys,
  hasOwn,
  isDangerousProtocol,
  last,
  nullReplaceEqualDeep,
  protocolRelativePrefixRegex,
  replaceEqualDeep,
} from './utils'
import {
  buildRouteBranch,
  findFlatMatch,
  findRouteMatch,
  findSingleMatch,
  parseSegments,
  processRouteMasks,
  processRouteTree,
} from './new-process-route-tree'
import {
  compileDecodeCharMap,
  interpolatePath,
  resolvePath,
  trimPath,
  trimPathRight,
} from './path'
import { createSieveCache } from './sieve-cache'
import { isNotFound } from './not-found'
import { setupScrollRestoration } from './scroll-restoration'
import { defaultParseSearch, defaultStringifySearch } from './searchParams'
import { rootRouteId } from './root'
import { isRedirect } from './redirect'
import {
  loadClientRoute,
  loadRouteChunk,
  preloadClientRoute,
  refreshClientRoute,
  replaceRouteChunk,
} from './load-client'
import {
  executeRewriteInput,
  executeRewriteOutput,
  rewriteBasepath,
} from './rewrite'
import { createRouterStores } from './stores'
import type { SieveCache } from './sieve-cache'
import type { RouteInterpolation } from './path'
import type {
  ProcessRouteTreeResult,
  ProcessedTree,
} from './new-process-route-tree'
import type { SearchParser, SearchSerializer } from './searchParams'
import type { AnyRedirect, ResolvedRedirect } from './redirect'
import type {
  LoadTransaction,
  LoaderFlight,
  PendingSession,
} from './load-client'
import type { ServerLoadResult } from './load-server'
import type {
  HistoryAction,
  HistoryLocation,
  HistoryState,
  ParsedHistoryState,
  RouterHistory,
} from '@tanstack/history'

import type {
  Awaitable,
  Constrain,
  NoInfer,
  NonNullableUpdater,
  PickAsRequired,
  Updater,
} from './utils'
import type { ParsedLocation } from './location'
import type {
  AnyContext,
  AnyRoute,
  AnyRouteWithContext,
  LoaderStaleReloadMode,
  MakeRemountDepsOptionsUnion,
  RouteMask,
  SearchMiddleware,
  SearchMiddlewareMeta,
} from './route'
import type {
  FullSearchSchema,
  RouteById,
  RoutePaths,
  RoutesById,
  RoutesByPath,
} from './routeInfo'
import type {
  AnyRouteMatch,
  MakeRouteMatch,
  MakeRouteMatchUnion,
  MatchRouteOptions,
} from './Matches'
import type {
  BuildLocationFn,
  CommitLocationOptions,
  NavigateFn,
} from './RouterProvider'
import type { Manifest, ManifestRouteAssets } from './manifest'
import type { AnySchema, AnyValidator } from './validators'
import type { NavigateOptions, ResolveRelativePath, ToOptions } from './link'
import type {
  AnySerializationAdapter,
  ValidateSerializableInput,
} from './ssr/serializer/transformer'
import type {
  HydrationScriptOutput,
  InitialHydrationScriptTags,
} from './ssr/hydrationScripts'
import type { GetStoreConfig, RouterStores } from './stores'

function isExternalUrl(url: URL, origin: string) {
  return (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.origin !== origin ||
    !!url.username ||
    !!url.password
  )
}

function getUrlPath(url: URL) {
  return url.pathname + url.search + url.hash
}

export type ControllablePromise<T = any> = Promise<T> & {
  resolve: (value: T) => void
  reject: (value?: any) => void
}

export interface Register {
  // Lots of things on here like...
  // router
  // config
  // ssr
}

export type RegisteredSsr<TRegister = Register> = TRegister extends {
  ssr: infer TSSR
}
  ? TSSR
  : false

export type RegisteredRouter<TRegister = Register> = TRegister extends {
  router: infer TRouter
}
  ? TRouter
  : AnyRouter

export type RegisteredConfigType<TRegister, TKey> = TRegister extends {
  config: infer TConfig
}
  ? TConfig extends {
      '~types': infer TTypes
    }
    ? TKey extends keyof TTypes
      ? TTypes[TKey]
      : unknown
    : unknown
  : unknown

export type DefaultRemountDepsFn<TRouteTree extends AnyRoute> = (
  opts: MakeRemountDepsOptionsUnion<TRouteTree>,
) => any

export interface DefaultRouterOptionsExtensions {}

export interface RouterOptionsExtensions extends DefaultRouterOptionsExtensions {}

export type SSROption = boolean | 'data-only'

export interface RouterOptions<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption,
  TDefaultStructuralSharingOption extends boolean = false,
  TRouterHistory extends RouterHistory = RouterHistory,
  TDehydrated = undefined,
> extends RouterOptionsExtensions {
  /**
   * The history object that will be used to manage the browser history.
   *
   * If not provided, a new createBrowserHistory instance will be created and used.
   *
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#history-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/history-types)
   */
  history?: TRouterHistory
  /**
   * A function that will be used to stringify search params when generating links.
   *
   * @default defaultStringifySearch
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#stringifysearch-method)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/custom-search-param-serialization)
   */
  stringifySearch?: SearchSerializer
  /**
   * A function that will be used to parse search params when parsing the current location.
   *
   * @default defaultParseSearch
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#parsesearch-method)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/custom-search-param-serialization)
   */
  parseSearch?: SearchParser
  /**
   * If `false`, routes will not be preloaded by default in any way.
   *
   * If `'intent'`, routes will be preloaded by default when the user hovers over a link or a `touchstart` event is detected on a `<Link>`.
   *
   * If `'viewport'`, routes will be preloaded by default when they are within the viewport.
   *
   * @default false
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultpreload-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/preloading)
   */
  defaultPreload?: false | 'intent' | 'viewport' | 'render'
  /**
   * The delay in milliseconds before intent focus/hover and viewport preloading.
   * Touch intent preloads immediately.
   *
   * @default 50
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultpreloaddelay-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/preloading#preload-delay)
   */
  defaultPreloadDelay?: number
  /**
   * The default `preloadIntentProximity` a route should use if no preloadIntentProximity is provided.
   *
   * @default 0
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultpreloadintentproximity-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/preloading#preload-intent-proximity)
   */
  defaultPreloadIntentProximity?: number
  /**
   * The default `pendingMs` a route should use if no pendingMs is provided.
   *
   * @default 1000
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultpendingms-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#avoiding-pending-component-flash)
   */
  defaultPendingMs?: number
  /**
   * The default `pendingMinMs` a route should use if no pendingMinMs is provided.
   *
   * @default 500
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultpendingminms-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#avoiding-pending-component-flash)
   */
  defaultPendingMinMs?: number
  /**
   * The default `staleTime` a route should use if no staleTime is provided. This is the time in milliseconds that a route will be considered fresh.
   *
   * @default 0
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultstaletime-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#key-options)
   */
  defaultStaleTime?: number
  /**
   * The default stale reload mode a route loader should use if no `loader.staleReloadMode` is provided.
   *
   * `'background'` preserves the current stale-while-revalidate behavior.
   * `'blocking'` waits for stale loader reloads to complete before resolving navigation.
   *
   * @default 'background'
   */
  defaultStaleReloadMode?: LoaderStaleReloadMode
  /**
   * The default `preloadStaleTime` a route should use if no preloadStaleTime is provided.
   *
   * @default 30_000 `(30 seconds)`
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultpreloadstaletime-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/preloading)
   */
  defaultPreloadStaleTime?: number
  /**
   * The default `preloadGcTime` a route should use if none is provided.
   *
   * @default 300_000 `(5 minutes)`
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultpreloadgctime-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/preloading)
   */
  defaultPreloadGcTime?: number
  /**
   * If `true`, route navigations will called using `document.startViewTransition()`.
   *
   * If the browser does not support this api, this option will be ignored.
   *
   * See [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Document/startViewTransition) for more information on how this function works.
   *
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultviewtransition-property)
   */
  defaultViewTransition?: boolean | ViewTransitionOptions
  /**
   * The default `hashScrollIntoView` a route should use if no hashScrollIntoView is provided while navigating
   *
   * See [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView) for more information on `ScrollIntoViewOptions`.
   *
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaulthashscrollintoview-property)
   */
  defaultHashScrollIntoView?: boolean | ScrollIntoViewOptions
  /**
   * @default 'fuzzy'
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#notfoundmode-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/not-found-errors#the-notfoundmode-option)
   */
  notFoundMode?: 'root' | 'fuzzy'
  /**
   * The default `gcTime` a route should use if no gcTime is provided.
   *
   * @default 300_000 `(5 minutes)`
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultgctime-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/data-loading#key-options)
   */
  defaultGcTime?: number
  /**
   * If `true`, all routes will be matched as case-sensitive.
   *
   * @default false
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#casesensitive-property)
   */
  caseSensitive?: boolean
  /**
   *
   * The route tree that will be used to configure the router instance.
   *
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#routetree-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/routing/route-trees)
   */
  routeTree?: TRouteTree
  /**
   * The basepath for then entire router. This is useful for mounting a router instance at a subpath.
   * ```
   * @default '/'
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#basepath-property)
   */
  basepath?: string
  /**
   * The root context that will be provided to all routes in the route tree.
   *
   * This can be used to provide a context to all routes in the tree without having to provide it to each route individually.
   *
   * Optional or required if the root route was created with [`createRootRouteWithContext()`](https://tanstack.com/router/latest/docs/framework/react/api/router/createRootRouteWithContextFunction).
   *
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#context-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/router-context)
   */
  context?: InferRouterContext<TRouteTree>

  additionalContext?: any

  /**
   * A function that will be called when the router is dehydrated.
   *
   * The return value of this function will be serialized and stored in the router's dehydrated state.
   *
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#dehydrate-method)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/external-data-loading#critical-dehydrationhydration)
   */
  dehydrate?: () => Awaitable<
    Constrain<TDehydrated, ValidateSerializableInput<Register, TDehydrated>>
  >
  /**
   * A function that will be called when the router is hydrated.
   *
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#hydrate-method)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/external-data-loading#critical-dehydrationhydration)
   */
  hydrate?: (dehydrated: TDehydrated) => Awaitable<void>
  /**
   * An array of route masks that will be used to mask routes in the route tree.
   *
   * Route masking is when you display a route at a different path than the one it is configured to match, like a modal popup that when shared will unmask to the modal's content instead of the modal's context.
   *
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#routemasks-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/route-masking)
   */
  routeMasks?: Array<RouteMask<TRouteTree>>
  /**
   * If `true`, route masks will, by default, be removed when the page is reloaded.
   *
   * This can be overridden on a per-mask basis by setting the `unmaskOnReload` option on the mask, or on a per-navigation basis by setting the `unmaskOnReload` option in the `Navigate` options.
   *
   * @default false
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#unmaskonreload-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/route-masking#unmasking-on-page-reload)
   */
  unmaskOnReload?: boolean

  /**
   * Use `notFoundComponent` instead.
   *
   * @deprecated
   * See https://tanstack.com/router/v1/docs/guide/not-found-errors#migrating-from-notfoundroute for more info.
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#notfoundroute-property)
   */
  notFoundRoute?: AnyRoute
  /**
   * Configures how trailing slashes are treated.
   *
   * - `'always'` will add a trailing slash if not present
   * - `'never'` will remove the trailing slash if present
   * - `'preserve'` will not modify the trailing slash.
   *
   * @default 'never'
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#trailingslash-property)
   */
  trailingSlash?: TTrailingSlashOption
  /**
   * While usually automatic, sometimes it can be useful to force the router into a server-side state, e.g. when using the router in a non-browser environment that has access to a global.document object.
   *
   * @default typeof document !== 'undefined'
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#isserver-property)
   */
  isServer?: boolean

  /**
   * @default false
   */
  isShell?: boolean

  /**
   * @default false
   */
  isPrerendering?: boolean

  /**
   * The default `ssr` a route should use if no `ssr` is provided.
   *
   * @default true
   */
  defaultSsr?: SSROption

  search?: {
    /**
     * Configures how unknown search params (= not returned by any `validateSearch`) are treated.
     *
     * @default false
     * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#search.strict-property)
     */
    strict?: boolean
  }

  /**
   * Configures whether structural sharing is enabled by default for fine-grained selectors.
   *
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#defaultstructuralsharing-property)
   */
  defaultStructuralSharing?: TDefaultStructuralSharingOption

  /**
   * Configures which URI characters are allowed in path params that would ordinarily be escaped by encodeURIComponent.
   * This is read only during initialization. Create a new router to change it.
   *
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#pathparamsallowedcharacters-property)
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/guide/path-params#allowed-characters)
   */
  readonly pathParamsAllowedCharacters?: ReadonlyArray<
    ';' | ':' | '@' | '&' | '=' | '+' | '$' | ','
  >

  defaultRemountDeps?: DefaultRemountDepsFn<TRouteTree>

  /**
   * If `true`, scroll restoration will be enabled
   *
   * @default false
   */
  scrollRestoration?:
    | boolean
    | ((opts: { location: ParsedLocation }) => boolean)

  /**
   * A function that will be called to get the key for the scroll restoration cache.
   *
   * @default (location) => location.href
   */
  getScrollRestorationKey?: (location: ParsedLocation) => string
  /**
   * The default behavior for scroll restoration.
   *
   * @default 'auto'
   */
  scrollRestorationBehavior?: ScrollBehavior
  /**
   * An array of selectors that will be used to scroll to the top of the page in addition to `window`
   *
   * @default ['window']
   */
  scrollToTopSelectors?: Array<string | (() => Element | null | undefined)>

  /**
   * When `true`, disables the global catch boundary that normally wraps all route matches.
   * This allows unhandled errors to bubble up to top-level error handlers in the browser.
   *
   * Useful for testing tools (like Storybook Test Runner), error reporting services,
   * and debugging scenarios where you want errors to reach the browser's global error handlers.
   *
   * @default false
   */
  disableGlobalCatchBoundary?: boolean

  /**
   * An array of URL protocols to allow in links, redirects, and navigation.
   * Absolute URLs with protocols not in this list will be rejected.
   *
   * @default DEFAULT_PROTOCOL_ALLOWLIST (http:, https:, mailto:, tel:)
   * @link [API Docs](https://tanstack.com/router/latest/docs/framework/react/api/router/RouterOptionsType#protocolallowlist-property)
   */
  protocolAllowlist?: Array<string>

  serializationAdapters?: ReadonlyArray<AnySerializationAdapter>
  /**
   * Configures how the router will rewrite the location between the actual href and the internal href of the router.
   *
   * @default undefined
   * @description You can provide a custom rewrite pair (in/out).
   * This is useful for shifting data from the origin to the path (for things like subdomain routing), or other advanced use cases.
   */
  rewrite?: LocationRewrite
  /**
   * The origin used to resolve URLs. Pass a normalized origin, such as
   * `https://example.com` or `http://localhost:3000`, without a path or trailing slash.
   * Defaults to the browser origin, or `http://localhost` on the server.
   */
  origin?: string
  ssr?: {
    nonce?: string
  }
}

export type LocationRewrite = {
  /**
   * A function that will be called to rewrite the URL before it is interpreted by the router from the history instance.
   *
   * @default undefined
   */
  input?: LocationRewriteFunction
  /**
   * A function that will be called to rewrite the URL before it is committed to the actual history instance from the router.
   *
   * @default undefined
   */
  output?: LocationRewriteFunction
}

/**
 * A function that will be called to rewrite the URL.
 *
 * @param url The URL to rewrite.
 * @returns The rewritten URL (as a URL instance or full href string) or undefined if no rewrite is needed.
 */
export type LocationRewriteFunction = ({
  url,
}: {
  url: URL
}) => undefined | string | URL

export interface RouterState<
  in out TRouteTree extends AnyRoute = AnyRoute,
  in out TRouteMatch = MakeRouteMatchUnion,
> {
  status: 'pending' | 'idle'
  isLoading: boolean
  matches: Array<TRouteMatch>
  location: ParsedLocation<FullSearchSchema<TRouteTree>>
  resolvedLocation?: ParsedLocation<FullSearchSchema<TRouteTree>>
}

export interface BuildNextOptions {
  to?: string | number | null
  params?: true | Updater<unknown>
  search?: true | Updater<unknown>
  hash?: true | Updater<string>
  state?: true | NonNullableUpdater<ParsedHistoryState, HistoryState>
  mask?: {
    to?: string | number | null
    params?: true | Updater<unknown>
    search?: true | Updater<unknown>
    hash?: true | Updater<string>
    state?: true | NonNullableUpdater<ParsedHistoryState, HistoryState>
    unmaskOnReload?: boolean
  }
  from?: string
  href?: string
  _fromLocation?: ParsedLocation
  unsafeRelative?: 'path'
  _isNavigate?: boolean
}

type NavigationEventInfo = {
  fromLocation?: ParsedLocation
  toLocation: ParsedLocation
  pathChanged: boolean
  hrefChanged: boolean
  hashChanged: boolean
}

export interface RouterEvents {
  onBeforeNavigate: {
    type: 'onBeforeNavigate'
  } & NavigationEventInfo
  onBeforeLoad: {
    type: 'onBeforeLoad'
  } & NavigationEventInfo
  onLoad: {
    type: 'onLoad'
  } & NavigationEventInfo
  onResolved: {
    type: 'onResolved'
  } & NavigationEventInfo
  onBeforeRouteMount: {
    type: 'onBeforeRouteMount'
  } & NavigationEventInfo
  onRendered: {
    type: 'onRendered'
  } & NavigationEventInfo
}

export type RouterEvent = RouterEvents[keyof RouterEvents]

export type ListenerFn<TEvent extends RouterEvent> = (event: TEvent) => void

export type RouterListener<TRouterEvent extends RouterEvent> = {
  eventType: TRouterEvent['type']
  fn: ListenerFn<TRouterEvent>
}

export type SubscribeFn = <TType extends keyof RouterEvents>(
  eventType: TType,
  fn: ListenerFn<RouterEvents[TType]>,
) => () => void

export interface MatchRoutesOpts {
  throwOnError?: boolean
  /** @internal */
  _controller?: AbortController
  /** @internal */
  _rematerialize?: boolean
}

function routeNeedsLoad(route: AnyRoute): unknown {
  return (
    route.options.loader ||
    route.options.beforeLoad ||
    route.lazyFn ||
    (route.options.component as any)?.preload ||
    (route.options.pendingComponent as any)?.preload
  )
}

export type InferRouterContext<TRouteTree extends AnyRoute> =
  TRouteTree['types']['routerContext']

export type RouterContextOptions<TRouteTree extends AnyRoute> =
  AnyContext extends InferRouterContext<TRouteTree>
    ? {
        context?: InferRouterContext<TRouteTree>
      }
    : {
        context: InferRouterContext<TRouteTree>
      }

export type RouterConstructorOptions<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption,
  TDefaultStructuralSharingOption extends boolean,
  TRouterHistory extends RouterHistory,
  TDehydrated extends Record<string, any>,
> = Omit<
  RouterOptions<
    TRouteTree,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption,
    TRouterHistory,
    TDehydrated
  >,
  'context' | 'serializationAdapters' | 'defaultSsr'
> &
  RouterContextOptions<TRouteTree>

export type PreloadRouteFn<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption,
  TDefaultStructuralSharingOption extends boolean,
  TRouterHistory extends RouterHistory,
  TDehydrated extends Record<string, any> = Record<string, any>,
> = <
  TFrom extends RoutePaths<TRouteTree> | string = string,
  TTo extends string | undefined = undefined,
  TMaskFrom extends RoutePaths<TRouteTree> | string = TFrom,
  TMaskTo extends string = '',
>(
  opts: NavigateOptions<
    RouterCore<
      TRouteTree,
      TTrailingSlashOption,
      TDefaultStructuralSharingOption,
      TRouterHistory,
      TDehydrated
    >,
    TFrom,
    TTo,
    TMaskFrom,
    TMaskTo
  >,
) => Promise<Array<AnyRouteMatch> | undefined>

export type MatchRouteFn<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption,
  TDefaultStructuralSharingOption extends boolean,
  TRouterHistory extends RouterHistory,
> = <
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string | undefined = undefined,
  TResolved = ResolveRelativePath<TFrom, NoInfer<TTo>>,
>(
  location: ToOptions<
    RouterCore<
      TRouteTree,
      TTrailingSlashOption,
      TDefaultStructuralSharingOption,
      TRouterHistory
    >,
    TFrom,
    TTo
  >,
  opts?: MatchRouteOptions,
) => false | RouteById<TRouteTree, TResolved>['types']['allParams']

export type UpdateFn<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption,
  TDefaultStructuralSharingOption extends boolean,
  TRouterHistory extends RouterHistory,
  TDehydrated extends Record<string, any>,
> = (
  newOptions: Omit<
    RouterConstructorOptions<
      TRouteTree,
      TTrailingSlashOption,
      TDefaultStructuralSharingOption,
      TRouterHistory,
      TDehydrated
    >,
    'pathParamsAllowedCharacters'
  >,
) => void

export type InvalidateFn<TRouter extends AnyRouter> = (opts?: {
  filter?: (d: MakeRouteMatchUnion<TRouter>) => boolean
  sync?: boolean
  forcePending?: boolean
}) => Promise<void>

export type ParseLocationFn<TRouteTree extends AnyRoute> = (
  locationToParse: HistoryLocation,
  previousLocation?: ParsedLocation<FullSearchSchema<TRouteTree>>,
) => ParsedLocation<FullSearchSchema<TRouteTree>>

export type GetMatchRoutesFn = (pathname: string) => [
  matchedRoutes: ReadonlyArray<AnyRoute>,
  /** exhaustive params, still in their string form */
  rawParams: Record<string, string>,
  foundRoute: AnyRoute | undefined,
]

export type EmitFn = (routerEvent: RouterEvent) => void

export type LoadFn = (opts?: {
  sync?: boolean
  action?: { type: HistoryAction }
  _signal?: AbortSignal
}) => Promise<void>

export type CommitLocationFn = ({
  viewTransition,
  ignoreBlocker,
  ...next
}: ParsedLocation & CommitLocationOptions) => Promise<void>

export type StartTransitionFn = (
  fn: () => void,
  expected: Array<AnyRouteMatch>,
) => Promise<boolean>

export interface MatchRoutesFn {
  (
    pathname: string,
    locationSearch?: AnySchema,
    opts?: MatchRoutesOpts,
  ): Array<MakeRouteMatchUnion>
  /**
   * @deprecated use the following signature instead
   */
  (next: ParsedLocation, opts?: MatchRoutesOpts): Array<AnyRouteMatch>
  (
    pathnameOrNext: string | ParsedLocation,
    locationSearchOrOpts?: AnySchema | MatchRoutesOpts,
    opts?: MatchRoutesOpts,
  ): Array<AnyRouteMatch>
}

export type LoadRouteChunkFn = (route: AnyRoute) => Promise<Array<void>>

export type ResolveRedirect = (err: AnyRedirect) => ResolvedRedirect

export type ClearCacheFn<TRouter extends AnyRouter> = (opts?: {
  filter?: (d: MakeRouteMatchUnion<TRouter>) => boolean
}) => void

/**
 * Server-side SSR request contract.
 *
 * Tiering rule: the flat methods are the adapter/framework contract;
 * `hydrationScripts` is transport for the core SSR stream merger only.
 * New members must land on the matching tier.
 */
export interface ServerSsr {
  /** @internal Transport access for the core SSR stream merger. */
  readonly hydrationScripts: {
    /** Request signal already observed by the live response transform. */
    requestSignal?: AbortSignal
    reserveFastPath: (output?: HydrationScriptOutput) => boolean
    claimOutput: () => HydrationScriptOutput
    liftBarrier: () => void
    isInitialTaken: () => boolean
    skipInitialTake: () => void
    startSerializationTimeout: (timeoutMs: number) => void
  }
  /** Framework-only. */
  onRenderFinished: (listener: () => void) => void
  /** Framework-only. */
  setRenderFinished: () => void
  /** Framework-only. */
  cleanup: () => void
  /**
   * Register a listener invoked when the SSR request lifecycle ends (success,
   * error, abort, or stream lifetime expiry). Use to tear down per-request
   * resources whose references would otherwise pin the router (e.g. query
   * cache subscriptions, gcTime timers, abort controllers).
   *
   * `settled` is true when every value the router dehydrated has settled, so
   * no loader work can still be pending. It is false when the response ended
   * early (abort, cancellation, timeout) or never consumed the loader data.
   *
   * Listeners run synchronously and exactly once. Errors are caught and logged.
   * A listener registered after cleanup already ran is invoked immediately.
   */
  onCleanup: (listener: (settled: boolean) => void) => void
  /** Framework-only. */
  dehydrate: (opts?: {
    requestAssets?: ManifestRouteAssets
    signal?: AbortSignal
  }) => Promise<void>
  /**
   * Framework-only: opt this request out of hydration output entirely (for
   * example a `hydrate: false` page). Call instead of `dehydrate()`, before
   * rendering starts. No hydration scripts are emitted, `<Scripts>` renders
   * no boundary, and the response takes the pass-through stream path.
   */
  disableHydration: () => void
  /** Framework-only. */
  takeInitialHydrationScriptTags: () => InitialHydrationScriptTags | undefined
}

export interface RouterSsrLifecycle {
  onServerSsrAttach?: Array<(serverSsr: ServerSsr) => void>
}

export type AnyRouterWithContext<TContext> = RouterCore<
  AnyRouteWithContext<TContext>,
  any,
  any,
  any,
  any
>

export type AnyRouter = RouterCore<any, any, any, any, any>

export interface ViewTransitionOptions {
  types:
    | Array<string>
    | ((locationChangeInfo: {
        fromLocation?: ParsedLocation
        toLocation: ParsedLocation
        pathChanged: boolean
        hrefChanged: boolean
        hashChanged: boolean
      }) => Array<string> | false)
}

// TODO where is this used? can we remove this?
/**
 * Convert an unknown error into a minimal, serializable object.
 * Includes name and message (and stack in development).
 */
export function defaultSerializeError(err: unknown) {
  if (err instanceof Error) {
    const obj = {
      name: err.name,
      message: err.message,
    }

    if (process.env.NODE_ENV === 'development') {
      ;(obj as any).stack = err.stack
    }

    return obj
  }

  return {
    data: err,
  }
}

/** Options for configuring trailing-slash behavior. */
export const trailingSlashOptions = {
  always: 'always',
  never: 'never',
  preserve: 'preserve',
} as const

export type TrailingSlashOption =
  (typeof trailingSlashOptions)[keyof typeof trailingSlashOptions]

/**
 * Compute whether path, href or hash changed between previous and current
 * resolved locations.
 */
export function getLocationChangeInfo(
  location: ParsedLocation,
  resolvedLocation?: ParsedLocation,
) {
  return {
    fromLocation: resolvedLocation,
    toLocation: location,
    pathChanged: resolvedLocation?.pathname !== location.pathname,
    hrefChanged: resolvedLocation?.href !== location.href,
    hashChanged: resolvedLocation?.hash !== location.hash,
  }
}

/**
 * Return only state owned by the application, excluding volatile history
 * bookkeeping. Mask payloads (`__tempLocation`/`__tempKey`) are kept: they
 * distinguish otherwise-identical locations.
 */
export function _getUserHistoryState({
  key: _key,
  __TSR_key: _tsrKey,
  __TSR_index: _tsrIndex,
  __hashScrollIntoViewOptions: _hashScroll,
  ...state
}: ParsedHistoryState): HistoryState {
  return state
}

export function lifecycleEnd(matches: Array<AnyRouteMatch>) {
  return (
    matches.findIndex(
      (match) =>
        match.status === 'error' ||
        match.status === 'notFound' ||
        match._notFound,
    ) + 1
  )
}

/** Run route lifecycle callbacks in leave/enter/stay phases. */
export function runRouteLifecycle(
  router: AnyRouter,
  previous: Array<AnyRouteMatch>,
  matches: Array<AnyRouteMatch>,
  previousEnd: number | undefined,
  nextEnd: number,
  owner?: LoadTransaction,
): void {
  // Zero or undefined means the full branch; copy only at a fallback.
  if (previousEnd) {
    previous = previous.slice(0, previousEnd)
  }
  if (nextEnd) {
    matches = matches.slice(0, nextEnd)
  }
  for (const match of previous) {
    if (owner && router._tx !== owner) {
      return
    }
    if (!matches.some((candidate) => candidate.routeId === match.routeId)) {
      ;(router.routesById as Record<string, AnyRoute>)[
        match.routeId
      ]!.options.onLeave?.(match)
    }
  }
  for (const match of matches) {
    if (owner && router._tx !== owner) {
      return
    }
    const route = (router.routesById as Record<string, AnyRoute>)[
      match.routeId
    ]!
    route.options[
      previous.some((candidate) => candidate.routeId === match.routeId)
        ? 'onStay'
        : 'onEnter'
    ]?.(match)
  }
}

type LightweightRouteMatchResult = [
  matchedRoutes: ReadonlyArray<AnyRoute>,
  fullPath: string,
  search: Record<string, unknown>,
  params: Record<string, unknown>,
]

type LightweightRouteMatchCacheEntry = [
  lastMatchId: string | undefined,
  result: LightweightRouteMatchResult,
]

/** Indexes and caches rebuilt together when the route tree changes. */
type RouteTreeCaches<TRouteTree extends AnyRoute> =
  ProcessRouteTreeResult<TRouteTree> & {
    resolvePathCache: SieveCache<string, string>
  }

export type CreateRouterFn = <
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption = 'never',
  TDefaultStructuralSharingOption extends boolean = false,
  TRouterHistory extends RouterHistory = RouterHistory,
  TDehydrated extends Record<string, any> = Record<string, any>,
>(
  options: undefined extends number
    ? 'strictNullChecks must be enabled in tsconfig.json'
    : RouterConstructorOptions<
        TRouteTree,
        TTrailingSlashOption,
        TDefaultStructuralSharingOption,
        TRouterHistory,
        TDehydrated
      >,
) => RouterCore<
  TRouteTree,
  TTrailingSlashOption,
  TDefaultStructuralSharingOption,
  TRouterHistory,
  TDehydrated
>

declare global {
  // eslint-disable-next-line no-var
  var __TSR_CACHE__:
    | {
        routeTree: AnyRoute
        caseSensitive: boolean | undefined
        processRouteTreeResult: RouteTreeCaches<AnyRoute>
      }
    | undefined
}

export interface RouterCore<
  in out TRouteTree extends AnyRoute,
  in out TTrailingSlashOption extends TrailingSlashOption,
  in out TDefaultStructuralSharingOption extends boolean,
  in out TRouterHistory extends RouterHistory = RouterHistory,
  in out TDehydrated extends Record<string, any> = Record<string, any>,
> {
  shouldViewTransition?: boolean | ViewTransitionOptions
  /**
   * Foreground lifecycle boundary survives invalidation/background statuses.
   * Zero or undefined means the whole branch participates.
   */
  _lifecycleEnd?: number
  /** Current client load transaction and owner of navigation writes. */
  _tx?: LoadTransaction
  /** Joinable in-flight loader generations keyed by match ID. */
  _flights?: Map<string, LoaderFlight>
  /** Active speculative lanes retained for cancellation, invalidation, and cache clearing. */
  _preloads?: Map<AbortController, Array<AnyRouteMatch>>
  /** Owns cancellable work before a client transaction publishes. */
  _preflight?: AbortController
  /** Transfers one reconstructed SSR prefix into its initial client load. */
  _handoff?: HydrationHandoff
  /** Pending-boundary reveal and minimum-visible timing state. */
  _pending?: PendingSession
  /** Result of the latest server load, used to render or redirect. */
  _serverResult?: ServerLoadResult
  /** Framework publication waiting for an exact render acknowledgement. */
  _rendered?: [
    offered?: Array<AnyRouteMatch>,
    settle?: (rendered: boolean) => void,
  ]
  /** Development-only HMR reload for a route and its descendants. */
  _refreshRoute: (() => Promise<void>) | undefined
  /** Development-only replacement for a route's lazy chunk owner. */
  _replaceRouteChunk:
    | ((route: AnyRoute, lazyFn: AnyRoute['lazyFn']) => void)
    | undefined
}

export type HydrationHandoff = [
  claim: () => AbortController | undefined,
  finish: (matches?: Array<AnyRouteMatch>) => number | undefined,
]

/**
 * Core, framework-agnostic router engine that powers TanStack Router.
 *
 * Provides navigation, matching, loading, preloading, caching and event APIs
 * used by framework adapters (React/Solid). Prefer framework helpers like
 * `createRouter` in app code.
 *
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/RouterType
 */
export class RouterCore<
  in out TRouteTree extends AnyRoute,
  in out TTrailingSlashOption extends TrailingSlashOption,
  in out TDefaultStructuralSharingOption extends boolean,
  in out TRouterHistory extends RouterHistory = RouterHistory,
  in out TDehydrated extends Record<string, any> = Record<string, any>,
> {
  // Option-independent properties
  tempLocationKey: string | undefined = `${Math.round(
    Math.random() * 10000000,
  )}`
  _scroll: {
    n: boolean // Reset scroll on the next render.
    // True until the current PUSH/REPLACE renders, so its hash owns window scroll.
    h?: boolean
    e?: boolean // Restoration enabled.
    s?: boolean // Snapshot/lifecycle listeners installed.
    r?: boolean // Render listener installed.
  } = { n: true }
  subscribers = new Set<RouterListener<RouterEvent>>()
  /** Accepted off-screen loader generations keyed by match ID. */
  _cache = new Map<string, AnyRouteMatch>()
  /** Accepted semantic lane, excluding temporary pending presentation. */
  _committed: Array<AnyRouteMatch> = []

  // Must build in constructor
  stores!: RouterStores<TRouteTree>
  private getStoreConfig!: GetStoreConfig
  batch!: (fn: () => void) => void

  options!: PickAsRequired<
    RouterOptions<
      TRouteTree,
      TTrailingSlashOption,
      TDefaultStructuralSharingOption,
      TRouterHistory,
      TDehydrated
    >,
    'stringifySearch' | 'parseSearch' | 'context'
  >
  history!: TRouterHistory
  rewrite?: LocationRewrite
  origin!: string
  latestLocation!: ParsedLocation<FullSearchSchema<TRouteTree>>
  _pendingLocation?: ParsedLocation<FullSearchSchema<TRouteTree>>
  basepath!: string
  routeTree!: TRouteTree
  routesById!: RoutesById<TRouteTree>
  routesByPath!: RoutesByPath<TRouteTree>
  processedTree!: ProcessedTree<TRouteTree, any, any>
  resolvePathCache!: SieveCache<string, string>
  private lightweightCache!: WeakMap<
    ParsedLocation,
    LightweightRouteMatchCacheEntry
  >
  // Locations built without reading the current location, keyed by the stable
  // options object a Link owns. Links pass a new object when their values change.
  // Client only: server renders never repeat an options object, so server
  // bundles fold `isServer` and drop the cache entirely.
  private staticLocations: WeakMap<object, ParsedLocation> | undefined
  isServer!: boolean
  readonly pathParamsDecoder?: (encoded: string) => string
  protocolAllowlist!: Set<string>

  /**
   * @deprecated Use the `createRouter` function instead
   */
  constructor(
    options: RouterConstructorOptions<
      TRouteTree,
      TTrailingSlashOption,
      TDefaultStructuralSharingOption,
      TRouterHistory,
      TDehydrated
    >,
    getStoreConfig: GetStoreConfig,
  ) {
    this.getStoreConfig = getStoreConfig
    if (options.pathParamsAllowedCharacters?.length) {
      this.pathParamsDecoder = compileDecodeCharMap(
        options.pathParamsAllowedCharacters,
      )
    }

    this.update({
      defaultPreloadDelay: 50,
      defaultPendingMs: 1000,
      defaultPendingMinMs: 500,
      context: undefined!,
      ...options,
      caseSensitive: options.caseSensitive ?? false,
      notFoundMode: options.notFoundMode ?? 'fuzzy',
      stringifySearch: options.stringifySearch ?? defaultStringifySearch,
      parseSearch: options.parseSearch ?? defaultParseSearch,
      protocolAllowlist:
        options.protocolAllowlist ?? DEFAULT_PROTOCOL_ALLOWLIST,
    })

    if (!(isServer ?? typeof document === 'undefined')) {
      self.__TSR_ROUTER__ = this
    }
  }

  startTransition: StartTransitionFn = async (fn) => {
    fn()
    return false
  }
  isShell() {
    return !!this.options.isShell
  }

  update: UpdateFn<
    TRouteTree,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption,
    TRouterHistory,
    TDehydrated
  > = (newOptions) => {
    if (process.env.NODE_ENV !== 'production') {
      if (newOptions.notFoundRoute) {
        console.warn(
          'The notFoundRoute API is deprecated and will be removed in the next major version. See https://tanstack.com/router/v1/docs/framework/react/guide/not-found-errors#migrating-from-notfoundroute for more info.',
        )
      }
    }

    const prevOptions = this.options

    this.options = {
      ...prevOptions,
      ...newOptions,
    }

    this.isServer =
      this.options.isServer ?? isServer ?? typeof document === 'undefined'
    // `isServer` is a per-bundle constant, so server builds drop the cache.
    if (!(isServer ?? this.isServer)) {
      this.staticLocations = new WeakMap()
    }

    this.protocolAllowlist = new Set(this.options.protocolAllowlist)

    if (
      !this.history ||
      (this.options.history && this.options.history !== this.history)
    ) {
      if (!this.options.history) {
        if (!(isServer ?? this.isServer)) {
          this.history = createBrowserHistory() as TRouterHistory
        }
      } else {
        this.history = this.options.history
      }
    }

    this.origin = this.options.origin!
    if (!this.origin) {
      if (
        !(isServer ?? this.isServer) &&
        window?.origin &&
        window.origin !== 'null'
      ) {
        this.origin = window.origin
      } else {
        // fallback for the server, can be overridden by calling router.update({origin}) on the server
        this.origin = 'http://localhost'
      }
    }

    const nextBasepath = this.options.basepath ?? '/'
    const nextRewriteOption = this.options.rewrite
    const rewriteChanged =
      this.basepath !== nextBasepath ||
      prevOptions?.rewrite !== nextRewriteOption ||
      prevOptions?.caseSensitive !== this.options.caseSensitive

    if (rewriteChanged) {
      this.basepath = nextBasepath

      this.rewrite =
        nextBasepath !== '/' && trimPath(nextBasepath)
          ? rewriteBasepath(
              nextBasepath,
              this.options.caseSensitive,
              nextRewriteOption,
            )
          : nextRewriteOption
    }

    // Parse once, with the final rewrite in place.
    if (this.history) {
      this.updateLatestLocation()
    }

    if (
      this.options.routeTree !== this.routeTree ||
      ((isServer ?? this.isServer) &&
        prevOptions?.caseSensitive !== this.options.caseSensitive)
    ) {
      this.routeTree = this.options.routeTree as TRouteTree
      let processRouteTreeResult: RouteTreeCaches<TRouteTree>
      if (
        process.env.NODE_ENV !== 'development' &&
        (isServer ?? this.isServer) &&
        globalThis.__TSR_CACHE__ &&
        globalThis.__TSR_CACHE__.routeTree === this.routeTree &&
        globalThis.__TSR_CACHE__.caseSensitive === this.options.caseSensitive
      ) {
        const cached = globalThis.__TSR_CACHE__
        processRouteTreeResult = cached.processRouteTreeResult as any
      } else {
        processRouteTreeResult = this.buildRouteTree()
        // only cache if nothing else is cached yet
        if (
          process.env.NODE_ENV !== 'development' &&
          (isServer ?? this.isServer) &&
          globalThis.__TSR_CACHE__ === undefined
        ) {
          globalThis.__TSR_CACHE__ = {
            routeTree: this.routeTree,
            caseSensitive: this.options.caseSensitive,
            processRouteTreeResult: processRouteTreeResult as any,
          }
        }
      }
      this.setRoutes(processRouteTreeResult)
    }

    if (!this.stores) {
      if (this.latestLocation) {
        const config = this.getStoreConfig(this)
        this.batch = config.batch
        this.stores = createRouterStores(this.latestLocation, config)

        if (!(isServer ?? this.isServer)) {
          setupScrollRestoration(this)
        }
      }
    } else if (rewriteChanged) {
      // Existing stores hold the location parsed with the previous rewrite.
      this.stores.location.set(this.latestLocation)
    }
  }

  get state(): RouterState<TRouteTree> {
    return this.stores.__store.get()
  }

  updateLatestLocation = () => {
    this.latestLocation = this.parseLocation(
      this.history.location,
      this.latestLocation,
    )
  }

  buildRouteTree = (): RouteTreeCaches<TRouteTree> => {
    const result = processRouteTree(this.routeTree, this.options.caseSensitive)
    if (this.options.routeMasks) {
      processRouteMasks(this.options.routeMasks, result.processedTree)
    }

    return {
      ...result,
      resolvePathCache: createSieveCache(1000),
    }
  }

  setRoutes(caches: RouteTreeCaches<TRouteTree>) {
    Object.assign(this, caches)
    this.lightweightCache = new WeakMap()
    if (!(isServer ?? this.isServer)) {
      this.staticLocations = new WeakMap()
    }

    const notFoundRoute = this.options.notFoundRoute

    if (notFoundRoute) {
      notFoundRoute.init(99999999999)
      if (this.routesById[notFoundRoute.id] !== notFoundRoute) {
        // Standalone legacy fallbacks are not processed by the matching tree.
        notFoundRoute._interpolation = parseSegments(false, notFoundRoute, 0)
      }
      this.routesById[notFoundRoute.id] = notFoundRoute
    }
  }

  /**
   * Subscribe to router lifecycle events like `onBeforeNavigate`, `onLoad`,
   * `onResolved`, etc. Returns an unsubscribe function.
   *
   * @link https://tanstack.com/router/latest/docs/framework/react/api/router/RouterEventsType
   */
  subscribe: SubscribeFn = (eventType, fn) => {
    const listener: RouterListener<any> = {
      eventType,
      fn,
    }

    this.subscribers.add(listener)

    return () => {
      this.subscribers.delete(listener)
    }
  }

  emit: EmitFn = (routerEvent) => {
    for (const listener of this.subscribers) {
      if (listener.eventType === routerEvent.type) {
        try {
          listener.fn(routerEvent)
        } catch (e) {
          console.error(e)
        }
      }
    }
  }

  /**
   * Parse a HistoryLocation into a strongly-typed ParsedLocation using the
   * current router options, rewrite rules and search parser/stringifier.
   */
  parseLocation: ParseLocationFn<TRouteTree> = (
    locationToParse,
    previousLocation,
  ) => {
    const parse = (
      { pathname, search, hash, href }: HistoryLocation,
      state: HistoryLocation['state'],
    ): ParsedLocation<FullSearchSchema<TRouteTree>> => {
      // Fast path: no rewrite configured and pathname doesn't need encoding
      // Characters that need encoding: space, high unicode, control chars
      // eslint-disable-next-line no-control-regex
      if (!this.rewrite && !/[ \x00-\x1f\x7f\u0080-\uffff]/.test(pathname)) {
        const parsedSearch = this.options.parseSearch(search)
        const searchStr = this.options.stringifySearch(parsedSearch)

        return {
          href: pathname + searchStr + hash,
          publicHref: pathname + searchStr + hash,
          pathname: decodePath(pathname),
          external: false,
          searchStr,
          search: nullReplaceEqualDeep(
            previousLocation?.search,
            parsedSearch,
          ) as any,
          hash: decodePath(hash.slice(1)),
          state: replaceEqualDeep(previousLocation?.state, state),
        }
      }

      // The URL constructor normalizes the encoding of the history href; an
      // input rewrite may then change the URL before it is parsed.
      const url = executeRewriteInput(this.rewrite, new URL(href, this.origin))

      const parsedSearch = this.options.parseSearch(url.search)
      const searchStr = this.options.stringifySearch(parsedSearch)
      // Make sure our final url uses the re-stringified pathname, search, and has for consistency
      // (We were already doing this, so just keeping it for now)
      url.search = searchStr

      return {
        href: url.href.replace(url.origin, ''),
        publicHref: href,
        // An input rewrite can expose a path like "//evil.example".
        // Normalize it to "/evil.example" to keep it on the current origin.
        pathname: decodePath(normalizeProtocolRelative(url.pathname)),
        external: !!this.rewrite && isExternalUrl(url, this.origin),
        searchStr,
        search: nullReplaceEqualDeep(
          previousLocation?.search,
          parsedSearch,
        ) as any,
        hash: decodePath(url.hash.slice(1)),
        state: replaceEqualDeep(previousLocation?.state, state),
      }
    }

    const location = parse(locationToParse, locationToParse.state)

    const { __tempLocation, __tempKey } = location.state

    if (__tempLocation && (!__tempKey || __tempKey === this.tempLocationKey)) {
      // A masked entry stores the real location in its state. That location is
      // presented, adopting the committed entry's keys, while the URL that was
      // written to history remains available as `maskedLocation`.
      const parsedTempLocation = parse(__tempLocation, {
        ...__tempLocation.state,
        __tempLocation: undefined,
        key: location.state.key, // TODO: Remove in v2 - use __TSR_key instead
        __TSR_key: location.state.__TSR_key,
      })
      parsedTempLocation.maskedLocation = location
      return parsedTempLocation
    }
    return location
  }

  matchRoutes: MatchRoutesFn = (
    pathnameOrNext: string | ParsedLocation,
    locationSearchOrOpts?: AnySchema | MatchRoutesOpts,
    opts?: MatchRoutesOpts,
  ) => {
    if (typeof pathnameOrNext === 'string') {
      return this.matchRoutesInternal(
        {
          pathname: pathnameOrNext,
          search: locationSearchOrOpts,
        } as ParsedLocation,
        opts,
      )
    }

    return this.matchRoutesInternal(pathnameOrNext, locationSearchOrOpts)
  }

  private matchRoutesInternal(
    next: ParsedLocation,
    opts?: MatchRoutesOpts,
  ): Array<AnyRouteMatch> {
    const [initialMatchedRoutes, rawParams, foundRoute] = this.getMatchedRoutes(
      next.pathname,
    )
    let matchedRoutes = initialMatchedRoutes
    let isGlobalNotFound = false

    // Check to see if the route needs a 404 entry
    if (
      // If we found a route, and it's not an index route and we have left over path
      foundRoute
        ? foundRoute.path !== '/' && rawParams['**']
        : // Or if we didn't find a route and we have left over path
          trimPathRight(next.pathname)
    ) {
      // If the user has defined an (old) 404 route, use it
      if (this.options.notFoundRoute) {
        matchedRoutes = [...matchedRoutes, this.options.notFoundRoute]
      } else {
        // If there is no routes found during path matching
        isGlobalNotFound = true
      }
    }

    const _notFoundRouteId = isGlobalNotFound
      ? findGlobalNotFoundRouteId(this.options.notFoundMode, matchedRoutes)
      : undefined

    const matches = new Array<AnyRouteMatch>(matchedRoutes.length)
    const committed = this._committed
    const previousAt = (route: AnyRoute, index: number) => {
      const match = committed[index]
      return match?.routeId === route.id
        ? match
        : route === this.options.notFoundRoute
          ? committed.find((candidate) => candidate.routeId === route.id)
          : undefined
    }

    let strictParams: AnyRouteMatch['_strictParams'] | undefined
    for (let index = 0; index < matchedRoutes.length; index++) {
      const route = matchedRoutes[index]!
      // Take each matched route and resolve + validate its search params
      // This has to happen serially because each route's search params
      // can depend on the parent route's search params
      // It must also happen before we create the match so that we can
      // pass the search params to the route's potential key function
      // which is used to uniquely identify the route match in state

      const parentMatch = matches[index - 1]

      let preMatchSearch: Record<string, any>
      let strictMatchSearch: Record<string, any>
      let searchError: any
      {
        // Validate the search params and stabilize them
        const parentSearch = parentMatch?.search ?? next.search
        const parentStrictSearch = parentMatch?._strictSearch ?? undefined

        try {
          const strictSearch =
            validateSearch(route.options.validateSearch, { ...parentSearch }) ??
            undefined

          preMatchSearch = {
            ...parentSearch,
            ...strictSearch,
          }
          strictMatchSearch = { ...parentStrictSearch, ...strictSearch }
        } catch (err: any) {
          let searchParamError = err
          if (!(err instanceof SearchParamError)) {
            searchParamError = new SearchParamError(err.message, {
              cause: err,
            })
          }

          if (opts?.throwOnError) {
            throw searchParamError
          }

          preMatchSearch = parentSearch
          strictMatchSearch = {}
          searchError = searchParamError
        }
      }
      // This is where we need to call route.options.loaderDeps() to get any additional
      // deps that the route's loader function might need to run. We need to do this
      // before we create the match so that we can pass the deps to the route's
      // potential key function which is used to uniquely identify the route match in state

      let loaderDeps: any = ''
      let loaderDepsHash = ''
      try {
        loaderDeps =
          route.options.loaderDeps?.({
            search: preMatchSearch,
          }) ?? ''
        loaderDepsHash = loaderDeps ? JSON.stringify(loaderDeps) || '' : ''
      } catch (cause) {
        if (opts?.throwOnError) {
          throw cause
        }
        searchError ??= cause
      }
      // Match identity must only use the raw params captured from the URL.
      const usedParams: Record<string, unknown> = createNull()
      const interpolatedPath = route._interpolation
        ? interpolatePath(
            route.fullPath,
            route._interpolation,
            rawParams,
            this.pathParamsDecoder,
            usedParams,
          )
        : route.fullPath

      // Seed planning from the accepted same-ID cache generation first, then
      // from the committed generation for this route. Presentation stores are
      // deliberately not a semantic reuse authority.
      const matchId =
        // route.id for disambiguation
        route.id +
        // interpolatedPath for param changes
        interpolatedPath +
        // explicit deps
        loaderDepsHash

      const previousMatch = previousAt(route, index)
      const existingMatch =
        process.env.NODE_ENV !== 'production' && opts?._rematerialize
          ? undefined
          : (this._cache.get(matchId) ??
            (previousMatch?.id === matchId ? previousMatch : undefined))

      // Carry parsed ancestors forward without mutating the raw route params.
      strictParams =
        existingMatch?._strictParams ?? Object.assign(usedParams, strictParams)

      let paramsError: unknown

      if (!existingMatch) {
        try {
          extractStrictParams(route, strictParams)
        } catch (err: any) {
          if (isNotFound(err) || isRedirect(err)) {
            paramsError = err
          } else {
            paramsError = new PathParamError(err.message, {
              cause: err,
            })
          }

          if (opts?.throwOnError) {
            throw paramsError
          }
        }
      }

      const cause = previousMatch ? 'stay' : 'enter'

      let match: AnyRouteMatch

      if (existingMatch) {
        match = {
          ...existingMatch,
          cause,
          search: previousMatch
            ? nullReplaceEqualDeep(previousMatch.search, preMatchSearch)
            : nullReplaceEqualDeep(existingMatch.search, preMatchSearch),
          _strictSearch: strictMatchSearch,
          searchError,
        }
      } else {
        const status = routeNeedsLoad(route) ? 'pending' : 'success'

        match = {
          id: matchId,
          ssr: (isServer ?? this.isServer) ? undefined : route.options.ssr,
          index,
          routeId: route.id,
          params: previousMatch?.params ?? strictParams,
          _strictParams: strictParams,
          pathname: interpolatedPath,
          updatedAt: Date.now(),
          search: previousMatch
            ? nullReplaceEqualDeep(previousMatch.search, preMatchSearch)
            : preMatchSearch,
          _strictSearch: strictMatchSearch,
          searchError,
          status,
          isFetching: false,
          error: undefined,
          paramsError,
          context: {},
          abortController: opts?._controller ?? new AbortController(),
          cause,
          loaderDeps: previousMatch
            ? replaceEqualDeep(previousMatch.loaderDeps, loaderDeps)
            : loaderDeps,
          invalid: false,
          preload: false,
          staticData: route.options.staticData || {},
          fullPath: route.fullPath,
        }
      }

      // If we have a global not found, mark the right match as global not found
      const _notFound = _notFoundRouteId === route.id
      if (match._notFound && !_notFound) {
        match.error = undefined
      }
      match._notFound = _notFound

      matches[index] = match
    }

    for (let index = 0; index < matches.length; index++) {
      const match = matches[index]!
      match.params =
        match.cause === 'stay'
          ? nullReplaceEqualDeep(match.params, strictParams)
          : strictParams!
      if (opts?._controller) {
        match.context = {}
      }
    }

    return matches
  }

  getMatchedRoutes: GetMatchRoutesFn = (pathname) => {
    const rawParams: Record<string, string> = Object.create(null)
    const match = findRouteMatch(
      trimPathRight(pathname),
      this.processedTree,
      true,
    )
    if (match) {
      Object.assign(rawParams, match.rawParams)
    }
    return [
      match?.branch || [this.routesById[rootRouteId]!],
      rawParams,
      match?.route,
    ]
  }

  /**
   * Lightweight route matching for buildLocation.
   * Only computes fullPath, accumulated search, and params - skipping expensive
   * operations like AbortController, loaderDeps, and full match objects.
   */
  private matchRoutesLightweight(
    location: ParsedLocation,
  ): LightweightRouteMatchResult {
    const lastRouteId = last(this.stores.ids.get())
    const lastStateMatch = lastRouteId
      ? this.stores.byRoute.get(lastRouteId)!.get()
      : undefined
    const lastStateMatchId = lastStateMatch?.id
    const cached = this.lightweightCache.get(location)
    if (cached && cached[0 /* lastMatchId */] === lastStateMatchId) {
      return cached[1 /* result */]
    }

    const [matchedRoutes, rawParams] = this.getMatchedRoutes(location.pathname)
    const lastRoute = last(matchedRoutes)!

    // I don't know if we should run the full search middleware chain, or just validateSearch
    // // Accumulate search validation through the route chain
    // const accumulatedSearch: Record<string, unknown> = applySearchMiddleware({
    //   search: { ...location.search },
    //   dest: location,
    //   destRoutes: matchedRoutes,
    //   _includeValidateSearch: true,
    // })

    // Accumulate search validation through route chain
    const accumulatedSearch = { ...location.search }
    for (const route of matchedRoutes) {
      try {
        Object.assign(
          accumulatedSearch,
          validateSearch(route.options.validateSearch, accumulatedSearch),
        )
      } catch {
        // Ignore errors, we're not actually routing
      }
    }

    // Determine params: reuse from state if possible, otherwise parse
    const canReuseParams =
      lastStateMatch &&
      lastStateMatch.routeId === lastRoute.id &&
      lastStateMatch.pathname === location.pathname

    let params: Record<string, unknown>
    if (canReuseParams) {
      params = lastStateMatch.params
    } else {
      // Parse params through the route chain
      // getMatchedRoutes already copied the cached raw params.
      const strictParams: Record<string, unknown> = rawParams
      for (const route of matchedRoutes) {
        try {
          extractStrictParams(route, strictParams)
        } catch {
          // Ignore errors, we're not actually routing
        }
      }
      params = strictParams
    }

    const result: LightweightRouteMatchResult = [
      matchedRoutes,
      lastRoute.fullPath,
      accumulatedSearch,
      params,
    ]
    this.lightweightCache.set(location, [lastStateMatchId, result])
    return result
  }

  /**
   * Build the next ParsedLocation from navigation options without committing.
   * Resolves `to`/`from`, params/search/hash/state, applies search validation
   * and middlewares, and returns a stringified location object. The built
   * `search` and `state` are not structurally shared with the current
   * location; `parseLocation` stabilizes them once the location is committed.
   *
   * @link https://tanstack.com/router/latest/docs/framework/react/api/router/RouterType#buildlocation-method
   */
  buildLocation: BuildLocationFn = (opts) => {
    if (!(isServer ?? this.isServer)) {
      const cached = this.staticLocations!.get(opts)
      if (cached) {
        return cached
      }
    }

    // Set by `current()` whenever a build reads the current location. A
    // location built without it depends only on `opts` and the route tree.
    let usedCurrent = false

    const build = (
      dest: BuildNextOptions & {
        unmaskOnReload?: boolean
      } = {},
    ): ParsedLocation => {
      if (dest.href) {
        const parsed = parseHref(dest.href, {} as ParsedHistoryState)
        dest = {
          ...dest,
          to: executeRewriteInput(
            this.rewrite,
            new URL(parsed.pathname, this.origin),
          ).pathname,
          search: this.options.parseSearch(parsed.search),
          hash: parsed.hash.slice(1),
        }
      }

      // We allow the caller to override the current location. Masks build
      // from the same location as the destination they mask.
      const currentLocation =
        opts._fromLocation || this._pendingLocation || this.latestLocation

      // Value-affecting reads of the current location go through these two.
      // The lightweight match (fullPath, search, params without full match
      // objects) is only computed when a build actually reads it.
      let lightweight: LightweightRouteMatchResult | undefined
      const current = () => {
        usedCurrent = true
        return currentLocation
      }
      const currentMatch = () =>
        (lightweight ??= this.matchRoutesLightweight(current()))

      // check that from path exists in the current route tree
      // do this check only on navigations during test or development
      if (
        process.env.NODE_ENV !== 'production' &&
        dest.from &&
        dest._isNavigate
      ) {
        const [allFromMatches] = this.getMatchedRoutes(dest.from)
        const [matchedRoutes, fullPath] = currentMatch()

        const matchedFrom = findLast(matchedRoutes, (d) => {
          return comparePaths(d.fullPath, dest.from!)
        })

        const matchedCurrent = findLast(allFromMatches, (d) => {
          return comparePaths(d.fullPath, fullPath)
        })

        // for from to be invalid it shouldn't just be unmatched to currentLocation
        // but the currentLocation should also be unmatched to from
        if (!matchedFrom && !matchedCurrent) {
          console.warn(`Could not find match for from: ${dest.from}`)
        }
      }

      const to = dest.to ? `${dest.to}` : '.'
      const nextTo = resolvePath(
        // Absolute destinations resolve without a base.
        to[0] === '/'
          ? ''
          : dest.unsafeRelative === 'path'
            ? current().pathname
            : (dest.from ?? currentMatch()[1 /* fullPath */]),
        to,
        this.options.trailingSlash,
        this.resolvePathCache,
      )

      const destRoute = this.routesByPath[
        trimPathRight(nextTo) as keyof typeof this.routesByPath
      ] as AnyRoute | undefined

      const isTemplate = nextTo.includes('$')
      let destRoutes: ReadonlyArray<AnyRoute>
      if (destRoute) {
        destRoutes = destRoute._branch ??= buildRouteBranch(destRoute)
      } else if (isTemplate) {
        // Route templates must match routesByPath exactly. A miss here is a
        // typed destination mismatch, not a concrete URL to route-match.
        destRoutes = []
      } else {
        const [matchedRoutes, rawParams, foundRoute] =
          this.getMatchedRoutes(nextTo)
        destRoutes = matchedRoutes

        if (
          this.options.notFoundRoute &&
          (!foundRoute || (foundRoute.path !== '/' && rawParams['**']))
        ) {
          destRoutes = [...destRoutes, this.options.notFoundRoute]
        }
      }

      // One parsed template serves both trailing-slash variants.
      const interpolation = isTemplate
        ? (destRoute?._interpolation ??
          parseSegments(false, { fullPath: nextTo }, 0))
        : undefined

      let nextParams: Record<string, unknown> | undefined
      for (const route of destRoutes) {
        const fn =
          route.options.params?.stringify ?? route.options.stringifyParams
        if (fn) {
          // Stringifiers receive the merged params, so they always see inherited ones.
          const fromParams = currentMatch()[3 /* params */]
          nextParams ??= resolveNextParams(dest.params, fromParams)
          if (!hasKeys(nextParams)) {
            break
          }
          if (nextParams === fromParams) {
            nextParams = Object.assign(
              createNull() as Record<string, unknown>,
              nextParams,
            )
          }
          try {
            Object.assign(nextParams, fn(nextParams))
          } catch {
            // Ignore errors here. When a paired parseParams is defined,
            // extractStrictParams will re-throw during route matching,
            // storing the error on the match and allowing the route's
            // errorComponent to render. If no parseParams is defined,
            // the stringify error is silently dropped.
          }
        }
      }
      nextParams ??= resolveNextParams(
        dest.params,
        needsInheritedParams(dest.params, interpolation)
          ? currentMatch()[3 /* params */]
          : EMPTY_RECORD,
      )

      const nextPathname = opts.leaveParams
        ? // Keep path params uninterpolated for matchRoute/template matching.
          nextTo
        : normalizeProtocolRelative(
            decodePath(
              interpolation
                ? interpolatePath(
                    nextTo,
                    interpolation,
                    nextParams,
                    this.pathParamsDecoder,
                  )
                : nextTo,
            ),
          )

      if (
        process.env.NODE_ENV !== 'production' &&
        destRoute &&
        !opts.leaveParams
      ) {
        try {
          const foundRoute = this.getMatchedRoutes(nextPathname)[2]
          if (foundRoute?.id !== destRoute.id) {
            console.warn(
              `Generated path "${nextPathname}" for route "${destRoute.id}" matched route "${foundRoute?.id}" instead. This can happen when multiple route templates resolve to the same URL. Use the route template that matches the intended route, or adjust params.stringify if it changed the target path.`,
            )
          }
        } catch {
          // Ignore roundtrip validation errors. The generated location will be
          // handled by the normal navigation flow.
        }
      }

      // Resolve the next search
      const middlewares = getSearchMiddlewares(
        destRoutes,
        opts._includeValidateSearch,
      )
      const fromSearch = () => {
        let search = currentMatch()[2 /* search */]
        if (opts._includeValidateSearch && this.options.search?.strict) {
          const validatedSearch = {}
          destRoutes.forEach((route) => {
            if (route.options.validateSearch) {
              try {
                Object.assign(
                  validatedSearch,
                  validateSearch(route.options.validateSearch, {
                    ...validatedSearch,
                    ...search,
                  }),
                )
              } catch {
                // ignore errors here because they are already handled in matchRoutes
              }
            }
          })
          search = validatedSearch
        }
        return search
      }
      // A literal search never reads the current one. The result is not
      // structurally shared with the current search: `parseLocation` keeps
      // equal nested values stable once the location is committed.
      const nextSearch: Record<string, unknown> = middlewares.length
        ? applySearchMiddleware(middlewares, fromSearch(), dest)
        : dest.search === true
          ? fromSearch()
          : typeof dest.search === 'function'
            ? dest.search(fromSearch())
            : (dest.search as Record<string, unknown>) || EMPTY_RECORD

      // Stringify the next search
      const searchStr = this.options.stringifySearch(nextSearch)

      // Resolve the next hash
      const hash =
        dest.hash === true
          ? current().hash
          : typeof dest.hash === 'function'
            ? dest.hash(current().hash)
            : dest.hash || undefined

      // Resolve the next hash string
      const hashStr = hash ? `#${hash}` : ''

      // Resolve the next state. A literal state never reads the current one
      // and, like the search, is not shared with it here.
      const nextState: HistoryState = !dest.state
        ? EMPTY_RECORD
        : dest.state === true
          ? current().state
          : typeof dest.state === 'function'
            ? dest.state(current().state)
            : dest.state

      // Create the full path of the location
      const fullPath = `${nextPathname}${searchStr}${hashStr}`

      // Compute href and publicHref without URL construction when no rewrite
      let href: string
      let publicHref: string
      let external = false

      if (this.rewrite) {
        // With rewrite, we need to construct URL to apply the rewrite
        const url = new URL(fullPath, this.origin)
        const origin = url.origin
        const rewrittenUrl = executeRewriteOutput(this.rewrite, url)
        href = getUrlPath(url)
        // If rewrite changed the origin, publicHref needs full URL
        // Otherwise just use the path components
        if (isExternalUrl(rewrittenUrl, origin)) {
          publicHref = rewrittenUrl.href
          external = true
        } else {
          // A same-origin rewrite can produce a pathname like "//evil.example".
          // Normalize it to "/evil.example" so the link stays on this origin.
          publicHref = normalizeProtocolRelative(getUrlPath(rewrittenUrl))
        }
      } else {
        // Fast path: no rewrite, skip URL construction entirely
        // fullPath is already the correct href (origin-stripped)
        // We need to encode non-ASCII (unicode) characters for the href
        // since decodePath decoded them from the interpolated path
        href = encodePathLikeUrl(fullPath)
        publicHref = href
      }

      return {
        publicHref,
        href,
        pathname: nextPathname,
        search: nextSearch,
        searchStr,
        state: nextState as any,
        hash: hash ?? '',
        external,
        unmaskOnReload: dest.unmaskOnReload,
      }
    }

    const next = build(opts)

    if (opts.mask) {
      next.maskedLocation = build({
        from: opts.from,
        ...opts.mask,
      })
    } else if (this.options.routeMasks) {
      const match = findFlatMatch<RouteMask<TRouteTree>>(
        next.pathname,
        this.processedTree,
      )
      if (match) {
        const params = Object.assign(createNull(), match.rawParams)
        const { from: _from, params: maskParams, ...maskProps } = match.route

        // If mask has a params function, call it with the matched params as context
        // Otherwise, use the matched params or the provided params value
        const nextParams = resolveNextParams(maskParams, params)

        next.maskedLocation = build({
          from: opts.from,
          ...maskProps,
          params: nextParams,
        })
      }
    }

    // A mask that reads the current location marks the whole result through
    // `usedCurrent`. Route masks belong to the route tree and options, whose
    // updates replace the cache.
    if (!(isServer ?? this.isServer) && !usedCurrent && opts._fromLocation) {
      this.staticLocations!.set(opts, next)
    }

    return next
  }

  _commitPromise: (Promise<void> & { resolve: () => void }) | undefined

  /**
   * Commit a previously built location to history (push/replace), optionally
   * using view transitions and scroll restoration options.
   */
  commitLocation: CommitLocationFn = async ({
    viewTransition,
    ignoreBlocker,
    ...next
  }) => {
    if (isServer ?? this.isServer) {
      return
    }

    const nextLocation = next.maskedLocation ?? next
    if (nextLocation.external && !(isServer ?? this.isServer)) {
      return documentNavigation(this, nextLocation.publicHref, {
        replace: next.replace,
        ignoreBlocker,
      })
    }

    let historyAction: HistoryAction | undefined
    const isSameLocation =
      trimPathRight(this.latestLocation.href) === trimPathRight(next.href) &&
      deepEqual(
        _getUserHistoryState(next.state),
        _getUserHistoryState(this.latestLocation.state),
      )

    const previousCommitPromise = this._commitPromise
    let resolve!: () => void
    const commitPromise = new Promise<void>((done) => {
      resolve = done
    }) as Promise<void> & { resolve: () => void }
    commitPromise.resolve = () => {
      resolve()
      previousCommitPromise?.resolve()
    }
    this._commitPromise = commitPromise

    // Don't commit to history if nothing changed
    if (isSameLocation) {
      this.load()
    } else {
      let {
        // eslint-disable-next-line prefer-const
        maskedLocation,
        // eslint-disable-next-line prefer-const
        hashScrollIntoView,
        ...nextHistory
      } = next

      if (maskedLocation) {
        nextHistory = {
          ...maskedLocation,
          state: {
            ...maskedLocation.state,
            __tempKey: undefined,
            __tempLocation: {
              ...nextHistory,
              search: nextHistory.searchStr,
              state: {
                ...nextHistory.state,
                __tempKey: undefined!,
                __tempLocation: undefined!,
                __TSR_key: undefined!,
                key: undefined!, // TODO: Remove in v2 - use __TSR_key instead
              },
            },
          },
        }

        if (
          nextHistory.unmaskOnReload ??
          this.options.unmaskOnReload ??
          false
        ) {
          nextHistory.state.__tempKey = this.tempLocationKey
        }
      }

      nextHistory.state = {
        ...nextHistory.state,
        __hashScrollIntoViewOptions:
          hashScrollIntoView ?? this.options.defaultHashScrollIntoView ?? true,
      }

      this.shouldViewTransition = viewTransition

      historyAction = next.replace ? 'REPLACE' : 'PUSH'

      this.history[historyAction === 'REPLACE' ? 'replace' : 'push'](
        nextHistory.publicHref,
        nextHistory.state,
        { ignoreBlocker },
      )

      // Without a subscribed adapter the history commit cannot trigger the
      // load itself. The same-location branch already loads directly.
      if (!this.history.subscribers.size) {
        this.load({ action: { type: historyAction } })
      }
    }

    this._scroll.n = next.resetScroll ?? true

    return this._commitPromise
  }

  /** Convenience helper: build a location from options, then commit it. */
  buildAndCommitLocation = ({
    replace,
    resetScroll,
    hashScrollIntoView,
    viewTransition,
    ignoreBlocker,
    ...rest
  }: BuildNextOptions & CommitLocationOptions = {}): Promise<void> => {
    if (isServer ?? this.isServer) {
      return Promise.resolve()
    }

    const location = this.buildLocation({
      ...(rest as any),
      _includeValidateSearch: true,
    })

    this._pendingLocation = location as ParsedLocation<
      FullSearchSchema<TRouteTree>
    >

    const commitPromise = this.commitLocation({
      ...location,
      viewTransition,
      replace,
      resetScroll,
      hashScrollIntoView,
      ignoreBlocker,
    })

    // Clear pending location after commit starts
    // We do this on next microtask to allow synchronous navigate calls to chain
    queueMicrotask(() => {
      if (this._pendingLocation === location) {
        this._pendingLocation = undefined
      }
    })

    return commitPromise
  }

  /**
   * Imperatively navigate using standard `NavigateOptions`. When `reloadDocument`
   * or an absolute `href` is provided, performs a full document navigation.
   * Otherwise, builds and commits a client-side location.
   *
   * @link https://tanstack.com/router/latest/docs/framework/react/api/router/NavigateOptionsType
   */
  navigate: NavigateFn = async ({
    to,
    reloadDocument,
    href,
    publicHref,
    ...rest
  }) => {
    if (isServer ?? this.isServer) {
      return
    }

    const hrefScheme = href ? getUrlScheme(href) : undefined

    if (hrefScheme || reloadDocument) {
      // When to is provided, always build a location to get the proper publicHref
      // (this handles redirects where href might be an internal path from resolveRedirect)
      // When only href is provided (no to), use it directly as it should already
      // be a complete path (possibly with basepath)
      if (to !== undefined || !href) {
        const location = this.buildLocation({ to, ...rest } as any)
        const publicLocation = location.maskedLocation ?? location
        // Use publicHref which contains the path (origin-stripped is fine for reload)
        href ??= publicLocation.publicHref
        publicHref ??= publicLocation.publicHref
      }

      // Use publicHref when available and href is not a full URL,
      // otherwise use href directly (which may already include basepath)
      const reloadHref = !hrefScheme && publicHref ? publicHref : href

      return documentNavigation(this, reloadHref, rest)
    }

    return this.buildAndCommitLocation({
      ...rest,
      href,
      to: to as string,
      _isNavigate: true,
    })
  }

  load: LoadFn = async (opts): Promise<void> => {
    if (isServer ?? this.isServer) {
      return loadServerRoute(this, opts)
    }

    this.updateLatestLocation()
    if (opts?.action) {
      this._scroll.h =
        opts.action.type === 'PUSH' || opts.action.type === 'REPLACE'
    }
    await loadClientRoute(this, opts)
  }

  startViewTransition = (fn: () => Promise<void>) => {
    // Determine if we should start a view transition from the navigation
    // or from the router default
    const shouldViewTransition =
      this.shouldViewTransition ?? this.options.defaultViewTransition

    // Reset the view transition flag
    this.shouldViewTransition = undefined

    // Attempt to start a view transition (or just apply the changes if we can't)
    if (
      shouldViewTransition &&
      !(isServer ?? typeof document === 'undefined') &&
      typeof (document as any).startViewTransition === 'function'
    ) {
      // lib.dom.ts doesn't support viewTransition types variant yet.
      // TODO: Fix this when dom types are updated
      let startViewTransitionParams: any

      if (
        typeof shouldViewTransition === 'object' &&
        window.CSS?.supports?.('selector(:active-view-transition-type(a))')
      ) {
        const next = this.latestLocation
        const prevLocation = this.stores.resolvedLocation.get()

        const resolvedViewTransitionTypes =
          typeof shouldViewTransition.types === 'function'
            ? shouldViewTransition.types(
                getLocationChangeInfo(next, prevLocation),
              )
            : shouldViewTransition.types

        if (resolvedViewTransitionTypes === false) {
          return fn()
        }

        startViewTransitionParams = {
          update: fn,
          types: resolvedViewTransitionTypes,
        }
      } else {
        startViewTransitionParams = fn
      }

      return (document as any).startViewTransition(startViewTransitionParams)
        .updateCallbackDone
    }
    return fn()
  }

  /**
   * Invalidate selected match generations and optionally force current matches
   * back into a pending state.
   *
   * - Marks committed and cached matches whose IDs are selected as invalid.
   * - Retires selected active preloads so older work cannot publish fresh data.
   *
   * The next load decides when to publish pending UI, so invalidation does not
   * mutate the currently rendered status.
   */
  invalidate: InvalidateFn<
    RouterCore<
      TRouteTree,
      TTrailingSlashOption,
      TDefaultStructuralSharingOption,
      TRouterHistory,
      TDehydrated
    >
  > = (opts) => {
    const committedMatches = this._committed
    const filter = opts?.filter
    const preloads = this._preloads
    const invalidIds = new Set<string>()
    const consider = (match: AnyRouteMatch) => {
      if (!filter || filter(match as MakeRouteMatchUnion<this>)) {
        invalidIds.add(match.id)
      }
    }
    committedMatches.forEach(consider)
    this._cache.forEach(consider)
    preloads?.forEach((matches) => matches.forEach(consider))
    this._tx?.[3 /* matches */].forEach(consider)
    const abort: Array<AbortController> = []
    for (const [controller, matches] of preloads ?? []) {
      if (matches.some((match) => invalidIds.has(match.id))) {
        preloads!.delete(controller)
        abort.push(controller)
      }
    }
    const invalidate = (d: MakeRouteMatch<TRouteTree>) => {
      if (invalidIds.has(d.id)) {
        const route = this.routesById[d.routeId] as AnyRoute
        const next = {
          ...d,
          invalid: true,
          ...((opts?.forcePending ||
            d.status === 'error' ||
            d.status === 'notFound') &&
          routeNeedsLoad(route)
            ? ({ status: 'pending', error: undefined } as const)
            : undefined),
        }
        // Invalidation replaces this owner; it does not create another lease.
        ;(d as AnyRouteMatch & { _flight?: LoaderFlight })._flight = undefined
        return next
      }
      return d
    }

    this._committed = committedMatches.map(invalidate)
    // Cache entries are settled successes. Retiring matching active preload
    // owners makes an in-place stale mark sufficient while preserving data.
    for (const [id, match] of this._cache) {
      if (invalidIds.has(id)) {
        match.invalid = true
        if (opts?.forcePending) {
          match.status = 'pending'
        }
      }
    }
    // The superseding load must not discover any same-ID generation selected
    // for replacement. Existing owners release it in their normal order.
    for (const id of invalidIds) {
      const flight = this._flights?.get(id)
      this._flights?.delete(id)
      // A reserved discovery has no remaining match owner to retire it later.
      if (flight && !flight[2 /* leases */]) {
        abort.push(flight[1 /* controller */])
      }
    }
    for (const controller of abort) {
      controller.abort()
    }

    this.shouldViewTransition = false
    return this.load({ sync: opts?.sync })
  }

  resolveRedirect = (redirect: AnyRedirect): AnyRedirect => {
    const options = redirect.options
    let href = redirect.headers.get('Location') || options.href

    if (!href) {
      const location = this.buildLocation(options)
      href = (location.maskedLocation ?? location).publicHref || '/'
    }

    let scheme: string | undefined
    // Reject protocol-relative URLs such as "//evil.example", including
    // backslash and control-character variants, before checking the protocol.
    if (
      protocolRelativePrefixRegex.test(href) ||
      ((scheme = getUrlScheme(href)) && !this.protocolAllowlist.has(scheme))
    ) {
      throw new Error(
        process.env.NODE_ENV !== 'production'
          ? `Redirect blocked: unsafe protocol in href "${href}". Allowed protocols: ${Array.from(this.protocolAllowlist).join(', ')}.`
          : 'Redirect blocked: unsafe protocol',
      )
    }

    if (scheme === 'http:' || scheme === 'https:') {
      const url = new URL(href)
      if (url.pathname.startsWith('//')) {
        href = url.href
      } else if (!isExternalUrl(url, this.origin)) {
        href = getUrlPath(url)
        scheme = undefined
      }
    }
    if (scheme) {
      options.reloadDocument = true
    }

    options.href = href
    redirect.headers.set('Location', href)

    return redirect
  }

  clearCache: ClearCacheFn<this> = (opts) => {
    const cached = this._cache
    const preloads = this._preloads
    const filter = opts?.filter
    const discarded: Array<AnyRouteMatch> = []
    const discardedIds: Array<string> = []
    for (const [id, match] of cached) {
      if (!filter || filter(match as MakeRouteMatchUnion<this>)) {
        discardedIds.push(id)
        discarded.push(match)
      }
    }
    const abort: Array<AbortController> = []
    for (const [controller, matches] of preloads ?? []) {
      if (!filter || matches.some(filter as any)) {
        abort.push(controller)
        discarded.push(...matches)
      }
    }

    // Run every public filter before changing authority, then prune both maps
    // before releasing a public loader
    // signal, whose abort listeners can synchronously reenter the router.
    for (const id of discardedIds) {
      cached.delete(id)
    }
    for (const controller of abort) {
      preloads!.delete(controller)
    }
    // clearCache is a force-retirement boundary, so a final discarded lease
    // must not use the normal zero-owner handoff window.
    for (const match of discarded as Array<
      AnyRouteMatch & { _flight?: LoaderFlight }
    >) {
      const flight = match._flight
      match._flight = undefined
      if (flight && !--flight[2 /* leases */]) {
        if (this._flights?.get(match.id) === flight) {
          this._flights.delete(match.id)
        }
        abort.push(flight[1 /* controller */])
      }
    }
    for (const controller of abort) {
      controller.abort()
    }
  }

  loadRouteChunk: (
    route: AnyRoute,
    componentType?: 'errorComponent' | 'notFoundComponent' | false,
  ) => Promise<void> | undefined = loadRouteChunk

  preloadRoute: PreloadRouteFn<
    TRouteTree,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption,
    TRouterHistory,
    TDehydrated
  > = (opts) => preloadClientRoute(this, opts)

  matchRoute: MatchRouteFn<
    TRouteTree,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption,
    TRouterHistory
  > = (location, opts) => {
    const matchLocation = {
      ...location,
      to: location.to
        ? resolvePath(
            location.from || '',
            location.to as string,
            this.options.trailingSlash,
            this.resolvePathCache,
          )
        : undefined,
      params: location.params || {},
      leaveParams: true,
    }
    const next = this.buildLocation(matchLocation as any)

    const isPending = this.stores.status.get() === 'pending'
    if (opts?.pending && !isPending) {
      return false
    }

    const pending = opts?.pending ?? !isPending

    const baseLocation = pending
      ? this.latestLocation
      : this.stores.resolvedLocation.get() || this.stores.location.get()

    const match = findSingleMatch(
      next.pathname,
      opts?.caseSensitive ?? false,
      opts?.fuzzy ?? false,
      baseLocation.pathname,
      this.processedTree,
    )

    if (!match) {
      return false
    }

    if (location.params) {
      if (!deepEqual(match.rawParams, location.params, true)) {
        return false
      }
    }

    if (opts?.includeSearch ?? true) {
      return deepEqual(baseLocation.search, next.search, true)
        ? match.rawParams
        : false
    }

    return match.rawParams
  }

  ssr?: {
    manifest: Manifest | undefined
  }

  serverSsr?: ServerSsr

  serverSsrLifecycle?: RouterSsrLifecycle
}

async function documentNavigation(
  router: AnyRouter,
  href: string,
  {
    replace,
    ignoreBlocker,
  }: Pick<CommitLocationOptions, 'replace' | 'ignoreBlocker'>,
) {
  // Block dangerous protocols like javascript:, blob:, data:
  // These could execute arbitrary code if passed to window.location
  if (isDangerousProtocol(href, router.protocolAllowlist)) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`Blocked navigation to dangerous protocol: ${href}`)
    }
    return
  }

  // Check blockers for external URLs unless ignoreBlocker is true
  if (!ignoreBlocker) {
    const blockers = router.history._getBlockers()
    for (const blocker of blockers) {
      if (blocker?.blockerFn) {
        const shouldBlock = await blocker.blockerFn({
          currentLocation: router.history.location,
          nextLocation: router.history.location, // External URLs don't have a next location in our router
          action: replace ? 'REPLACE' : 'PUSH',
        })
        if (shouldBlock) {
          return
        }
      }
    }
  }

  // All blockers have allowed this navigation (or were explicitly skipped).
  // Avoid asking for approval again in the native beforeunload handler.
  router.history._ignoreNextBeforeUnload?.(href)
  if (replace) {
    window.location.replace(href)
  } else {
    window.location.href = href
  }
  return
}

/**
 * In non-production environments,
 * augment the RouterCore class with a `_refreshRoute` method
 * dedicated to HMR.
 */
if (process.env.NODE_ENV !== 'production') {
  RouterCore.prototype._replaceRouteChunk = replaceRouteChunk
  RouterCore.prototype._refreshRoute = async function () {
    this._serverResult = undefined
    this.updateLatestLocation()
    await refreshClientRoute(this)
  }
}

/** Error thrown when search parameter validation fails. */
export class SearchParamError extends Error {}

/** Error thrown when path parameter parsing/validation fails. */
export class PathParamError extends Error {}

const normalize = (str: string) =>
  str.endsWith('/') && str.length > 1 ? str.slice(0, -1) : str
function comparePaths(a: string, b: string) {
  return normalize(a) === normalize(b)
}

/**
 * Lazily import a module function and forward arguments to it, retaining
 * parameter and return types for the selected export key.
 */
export function lazyFn<
  T extends Record<string, (...args: Array<any>) => any>,
  TKey extends keyof T = 'default',
>(fn: () => Promise<T>, key?: TKey) {
  return async (
    ...args: Parameters<T[TKey]>
  ): Promise<Awaited<ReturnType<T[TKey]>>> => {
    const imported = await fn()
    return imported[key || 'default'](...args)
  }
}

/** Create an initial RouterState from a parsed location. */
export function getInitialRouterState(
  location: ParsedLocation,
): RouterState<any> {
  return {
    isLoading: false,
    status: 'idle',
    resolvedLocation: undefined,
    location,
    matches: [],
  }
}

function validateSearch(validateSearch: AnyValidator, input: unknown): unknown {
  if (validateSearch == null) return {}

  if ('~standard' in validateSearch) {
    const result = validateSearch['~standard'].validate(input)

    if (result instanceof Promise)
      throw new SearchParamError('Async validation not supported')

    if (result.issues)
      throw new SearchParamError(JSON.stringify(result.issues, undefined, 2), {
        cause: result,
      })

    return result.value
  }

  if ('parse' in validateSearch) {
    return validateSearch.parse(input)
  }

  if (typeof validateSearch === 'function') {
    return validateSearch(input)
  }

  return {}
}

function resolveNextParams(
  spec: unknown,
  base: Record<string, unknown>,
): Record<string, unknown> {
  if (spec === undefined || spec === true) {
    return base
  }
  const next = Object.create(null)
  if (spec === false || spec === null) {
    return next
  }
  if (typeof spec === 'function') {
    Object.assign(next, base)
    return Object.assign(next, spec(next))
  }
  return Object.assign(next, base, spec)
}

// Inherited params are read by param updaters and by template keys the
// destination leaves open. `interpolation` is undefined without template keys.
function needsInheritedParams(
  spec: unknown,
  interpolation: RouteInterpolation | undefined,
) {
  if (typeof spec === 'function') {
    return true
  }
  if (!interpolation || spec === false || spec === null) {
    return false
  }
  return (
    spec === undefined ||
    spec === true ||
    interpolation.some(
      (part) =>
        typeof part !== 'string' && !hasOwn.call(spec, part[1 /* key */]),
    )
  )
}

const EMPTY_RECORD: Record<string, never> = Object.freeze({})

// Keep this separate from recursive execution to limit JIT compiler memory.
// A counted loop instead of `for...of`: Maglev's inlined array iteration
// deoptimizes on route option shapes and recompiles later, whereas indexed
// reads stay optimized once compiled.
function getSearchMiddlewares(
  destRoutes: ReadonlyArray<AnyRoute>,
  includeValidateSearch: boolean | undefined,
) {
  const middlewares = [] as Array<SearchMiddleware<any>>

  for (let i = 0; i < destRoutes.length; i++) {
    const routeOptions = destRoutes[i]!.options
    if ('search' in routeOptions) {
      if (routeOptions.search?.middlewares) {
        middlewares.push(...routeOptions.search.middlewares)
      }
    }
    // TODO remove preSearchFilters and postSearchFilters in v2
    else if (routeOptions.preSearchFilters || routeOptions.postSearchFilters) {
      const legacyMiddleware: SearchMiddleware<any> = ({ search, next }) => {
        const nextSearch = routeOptions.preSearchFilters
          ? routeOptions.preSearchFilters.reduce(
              (prev, next) => next(prev),
              search,
            )
          : search

        const result = next(nextSearch)

        return routeOptions.postSearchFilters
          ? routeOptions.postSearchFilters.reduce(
              (prev, next) => next(prev),
              result,
            )
          : result
      }
      middlewares.push(legacyMiddleware)
    }

    const routeValidateSearch = routeOptions.validateSearch
    if (includeValidateSearch && routeValidateSearch) {
      const validate: SearchMiddleware<any> = ({ search, next, meta }) => {
        const result = next(search)
        try {
          const validated = validateSearch(routeValidateSearch, result) as any

          if (meta && validated) {
            for (const key in validated) {
              if (!(key in result)) {
                ;(meta.defaulted ||= new Map()).set(key, validated[key])
              }
            }
          }
          return { ...result, ...validated }
        } catch {
          // ignore errors here because they are already handled in matchRoutes
        }
        return result
      }

      middlewares.push(validate)
    }
  }

  return middlewares
}

function applySearchMiddleware(
  middlewares: Array<SearchMiddleware<any>>,
  search: any,
  dest: BuildNextOptions,
) {
  const applyNext = (
    index: number,
    currentSearch: any,
    meta?: SearchMiddlewareMeta,
  ): any => {
    // no more middlewares left, return the current search
    if (index >= middlewares.length) {
      if (!dest.search) {
        return {}
      }
      if (dest.search === true) {
        return currentSearch
      }
      const result = functionalUpdate(dest.search, currentSearch)
      if (meta) {
        meta.explicit = result
      }
      return result
    }

    const next = (newSearch: any, collectMeta?: true): any => {
      if (collectMeta) {
        const nextMeta = meta || ({} as SearchMiddlewareMeta)
        return {
          search: applyNext(index + 1, newSearch, nextMeta),
          meta: nextMeta,
        }
      }
      return applyNext(index + 1, newSearch, meta)
    }

    return (middlewares[index]! as any)({ search: currentSearch, next, meta })
  }

  return applyNext(0, search)
}

function findGlobalNotFoundRouteId(
  notFoundMode: 'root' | 'fuzzy' | undefined,
  routes: ReadonlyArray<AnyRoute>,
) {
  if (notFoundMode !== 'root') {
    let fallback
    for (let i = routes.length - 1; i >= 0; i--) {
      const route = routes[i]!
      if (route.options.notFoundComponent) {
        return route.id
      }
      fallback ||= route.children && route.id
    }
    if (fallback) {
      return fallback
    }
  }
  return rootRouteId
}

function extractStrictParams(
  route: AnyRoute,
  accumulatedParams: Record<string, unknown>,
) {
  const parseParams = route.options.params?.parse ?? route.options.parseParams
  if (parseParams) {
    Object.assign(
      accumulatedParams,
      parseParams(accumulatedParams as Record<string, string>),
    )
  }
}
