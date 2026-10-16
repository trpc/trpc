import * as Vue from 'vue'
import {
  deepEqual,
  getUrlScheme,
  hasKeys,
  isDangerousProtocol,
  preloadWarning,
  removeTrailingSlash,
} from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'

import { useRouter } from './useRouter'
import { linkLocationContext } from './matchContext'
import { useIntersectionObserver } from './utils'

import type {
  AnyRouter,
  Constrain,
  LinkOptions,
  ParsedLocation,
  RegisteredRouter,
  RoutePaths,
} from '@tanstack/router-core'
import type { AnchorHTMLAttributes, ReservedProps } from '@vue/runtime-dom'
import type {
  ValidateLinkOptions,
  ValidateLinkOptionsArray,
} from './typePrimitives'

type EventHandler<TEvent = Event> = (e: TEvent) => void

type DataAttributes = {
  [K in `data-${string}`]?: unknown
}

type LinkHTMLAttributes = AnchorHTMLAttributes &
  ReservedProps &
  DataAttributes & {
    // Vue's runtime-dom types use lowercase event names.
    // Also accept camelCase versions for external API compatibility.
    onMouseEnter?: EventHandler<MouseEvent>
    onMouseLeave?: EventHandler<MouseEvent>
    onMouseOver?: EventHandler<MouseEvent>
    onMouseOut?: EventHandler<MouseEvent>
    onTouchStart?: EventHandler<TouchEvent>

    // `disabled` is not a valid <a> attribute, but is useful when using `asChild`.
    disabled?: boolean
  }

type VueStyleLinkEventHandlers = {
  onMouseenter?: EventHandler<MouseEvent>
  onMouseleave?: EventHandler<MouseEvent>
  onMouseover?: EventHandler<MouseEvent>
  onMouseout?: EventHandler<MouseEvent>
  onTouchstart?: EventHandler<TouchEvent>
}

type LinkEventHandlers = {
  onClick: EventHandler<PointerEvent>
  onBlur: EventHandler<FocusEvent>
  onFocus: EventHandler<FocusEvent>
  onMouseenter: EventHandler<MouseEvent>
  onMouseleave: EventHandler<MouseEvent>
  onMouseover: EventHandler<MouseEvent>
  onMouseout: EventHandler<MouseEvent>
  onTouchstart: EventHandler<TouchEvent>
}

interface StyledProps {
  class?: LinkHTMLAttributes['class']
  style?: LinkHTMLAttributes['style']
  [key: string]: unknown
}

type PropsOfComponent<TComp> =
  // Functional components
  TComp extends (props: infer P, ...args: Array<unknown>) => any
    ? P
    : // Vue components (defineComponent, class components, etc)
      TComp extends Vue.Component<infer P>
      ? P
      : Record<string, unknown>

type AnyLinkPropsOptions = UseLinkPropsOptions<any, any, any, any, any> & {
  _asChild?: unknown
}
type LinkEventOptions = AnyLinkPropsOptions & Partial<VueStyleLinkEventHandlers>

export function useLinkProps<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '',
>(
  options: UseLinkPropsOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
): LinkHTMLAttributes {
  return useLinkPropsImpl(() => options as AnyLinkPropsOptions)
}

function useLinkPropsImpl(
  getOptions: () => AnyLinkPropsOptions,
): LinkHTMLAttributes {
  const router = useRouter()
  let renderFetchedHref: string | undefined

  // Ensure router is defined before proceeding
  if (!router) {
    console.warn('useRouter must be used inside a <RouterProvider> component!')
    return {}
  }

  // During SSR we render exactly once and do not need reactivity.
  // Avoid store subscriptions, effects and observers on the server.
  if (isServer ?? router.isServer) {
    const options = getOptions()
    if (getUrlScheme(`${options.to}`)) {
      return Vue.shallowRef(
        getExternalLinkProps(options, router),
      ) as unknown as LinkHTMLAttributes
    }

    const next = router.buildLocation(options as any)
    const href = getHref(options, router, next)

    const isActive =
      !options.disabled && (href === undefined || !!getUrlScheme(href))
        ? false
        : getIsActive(
            router.stores.location.get(),
            next,
            options.activeOptions,
            router,
          )

    const { resolvedProps, resolvedClass, resolvedStyle } = resolveStyleProps(
      options,
      isActive,
    )

    const result = combineResultProps({
      href,
      options,
      isActive,
      resolvedProps,
      resolvedClass,
      resolvedStyle,
    })

    return Vue.shallowRef(
      result as LinkHTMLAttributes,
    ) as unknown as LinkHTMLAttributes
  }

  const ref = Vue.ref<Element | null>(null)

  const isExternal = () => !!getUrlScheme(`${getOptions().to}`)

  // Links build from the location their match presents, or the router's live
  // one outside every match. External links never read it.
  const source = Vue.inject(linkLocationContext)!

  // Rebuild only when the href moves.
  const currentLocation = Vue.computed((prev?: ParsedLocation) =>
    prev?.href === source.value.href ? prev : source.value,
  )

  // The Link's own destination options, replaced only when a navigation
  // option changes identity: the router reuses a location built from the same
  // object without reading the current location. A reactive value changes in
  // place, so a reactive option value (checked one level deep, not nested)
  // gets a fresh object per location instead, re-read at each navigation. A
  // mask holds destination options of its own, so its values are checked too.
  const dest = Vue.computed((prev?: Record<string, any>) => {
    const options = getOptions() as Record<string, any>
    const dest: Record<string, any> = {}
    let same = !!prev
    for (const key of NAVIGATION_KEYS) {
      const value = (dest[key] = options[key])
      if (
        Vue.isProxy(value) ||
        (key === 'mask' && value && Object.values(value).some(Vue.isProxy))
      ) {
        // Track the location: a reactive value is re-read at each one.
        same = !currentLocation.value
      }
      same &&= prev![key] === value
    }
    return same ? prev! : dest
  })

  // Clicks and preloads build from the latest location the Link's match
  // presents.
  const navigateOptions = () => {
    const options = dest.value
    options._fromLocation = source.value
    return options as any
  }

  // [href, active] of an internal Link, derived in one computation. An
  // unchanged result keeps its identity, so a navigation that leaves the Link
  // as it was notifies nothing downstream.
  const state = Vue.computed((prev?: LinkState): LinkState => {
    const options = getOptions()
    const destOptions = dest.value
    // Rebuild when inherited search/hash or the current route context changes.
    destOptions._fromLocation = currentLocation.value
    const next = router.buildLocation(destOptions as any)
    const href = getHref(options, router, next)
    const isActive =
      !options.disabled && (href === undefined || !!getUrlScheme(href))
        ? false
        : getIsActive(
            currentLocation.value,
            next,
            options.activeOptions,
            router,
          )
    return prev &&
      prev[0 /* href */] === href &&
      prev[1 /* isActive */] === isActive
      ? prev
      : [href, isActive]
  })

  // The requested mode does not depend on the location, so the preload
  // effects do not run on navigations.
  const preloadMode = Vue.computed(() => {
    const options = getOptions()
    return (
      !isExternal() &&
      !options.reloadDocument &&
      !options.disabled &&
      (options.preload ?? router.options.defaultPreload)
    )
  })
  const preload = () => {
    const href = !isExternal() && state.value[0 /* href */]
    return !!href && !getUrlScheme(href) && preloadMode.value
  }

  const preloadDelay = () =>
    getOptions().preloadDelay ?? router.options.defaultPreloadDelay ?? 0

  const doPreload = () => {
    return router.preloadRoute(navigateOptions()).catch((err: any) => {
      console.warn(err)
      console.warn(preloadWarning)
    })
  }

  let pendingPreload: 'intent' | 'viewport' | undefined
  let preloadTimeout: ReturnType<typeof setTimeout> | undefined
  const cancelPreload = () => {
    clearTimeout(preloadTimeout)
    preloadTimeout = pendingPreload = undefined
  }

  const enqueuePreload = (
    e?: MouseEvent | FocusEvent | IntersectionObserverEntry,
  ) => {
    if (!e) {
      cancelPreload()
      return
    }

    const isIntersecting = (e as IntersectionObserverEntry).isIntersecting
    const preloadMode = isIntersecting === undefined ? 'intent' : 'viewport'
    if (preload() !== preloadMode || isIntersecting === false) {
      if (isIntersecting === false && pendingPreload === 'viewport') {
        cancelPreload()
      }
      return
    }

    if (!preloadDelay()) {
      doPreload()
      return
    }

    if (!preloadTimeout) {
      const scheduledHref = state.value[0 /* href */]
      pendingPreload = preloadMode
      preloadTimeout = setTimeout(() => {
        preloadTimeout = pendingPreload = undefined
        if (
          preload() === preloadMode &&
          state.value[0 /* href */] === scheduledHref
        ) {
          doPreload()
        }
      }, preloadDelay())
    }
  }

  useIntersectionObserver(
    ref,
    enqueuePreload,
    () => preloadMode.value !== 'viewport',
    // Intent preloading still needs timer cleanup without an observer.
    () => !!preloadMode.value,
  )

  Vue.watchEffect(() => {
    if (preloadMode.value !== 'render' || !preload()) {
      return
    }

    const nextHref = state.value[0 /* href */]
    if (nextHref && renderFetchedHref !== nextHref) {
      renderFetchedHref = nextHref
      doPreload()
    }
  })

  // The click handler
  const handleClick = (e: PointerEvent): void => {
    const options = getOptions()
    const href = !isExternal() && state.value[0 /* href */]
    if (!options.disabled && (!href || getUrlScheme(href))) {
      return
    }

    // Check actual element's target attribute as fallback
    const elementTarget = (
      e.currentTarget as HTMLAnchorElement | SVGAElement
    )?.getAttribute('target')
    const effectiveTarget =
      options.target !== undefined ? options.target : elementTarget

    if (
      !options.disabled &&
      !(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) &&
      !e.defaultPrevented &&
      (!effectiveTarget || effectiveTarget === '_self') &&
      e.button === 0
    ) {
      // Don't prevent default or handle navigation if reloadDocument is true
      if (options.reloadDocument) {
        return
      }

      e.preventDefault()
      enqueuePreload()

      // All is well? Navigate!
      router.navigate(navigateOptions())
    }
  }

  const handleTouchStart = () => {
    if (preload() === 'intent') {
      doPreload()
    }
  }

  const handleLeave = () => {
    if (pendingPreload === 'intent') {
      cancelPreload()
    }
  }

  function composeEventHandlers<T extends Event>(
    getUserHandler: () => EventHandler<T> | undefined,
    handler: EventHandler<T>,
  ): (e: T) => void {
    return (event: T) => {
      getUserHandler()?.(event)
      handler(event)
    }
  }

  // Create static event handlers that don't change between renders
  const staticEventHandlers: LinkEventHandlers = {
    onClick: composeEventHandlers(() => getOptions().onClick, handleClick),
    onBlur: composeEventHandlers(() => getOptions().onBlur, handleLeave),
    onFocus: composeEventHandlers(() => getOptions().onFocus, enqueuePreload),
    onMouseenter: composeEventHandlers(
      () => getLinkEventHandlers(getOptions() as LinkEventOptions).onMouseenter,
      enqueuePreload,
    ),
    onMouseover: composeEventHandlers(
      () => getLinkEventHandlers(getOptions() as LinkEventOptions).onMouseover,
      enqueuePreload,
    ),
    onMouseleave: composeEventHandlers(
      () => getLinkEventHandlers(getOptions() as LinkEventOptions).onMouseleave,
      handleLeave,
    ),
    onMouseout: composeEventHandlers(
      () => getLinkEventHandlers(getOptions() as LinkEventOptions).onMouseout,
      handleLeave,
    ),
    onTouchstart: composeEventHandlers(
      () => getLinkEventHandlers(getOptions() as LinkEventOptions).onTouchstart,
      handleTouchStart,
    ),
  }

  // Compute all props synchronously to avoid hydration mismatches
  // Using Vue.computed ensures props are calculated at render time, not after
  const computedProps = Vue.computed<LinkHTMLAttributes>(() => {
    const options = getOptions()
    if (isExternal()) {
      return getExternalLinkProps(options, router, ref, staticEventHandlers)
    }

    const [href, isActive] = state.value
    const { resolvedProps, resolvedClass, resolvedStyle } = resolveStyleProps(
      options,
      isActive,
    )
    return combineResultProps({
      href,
      options,
      ref,
      staticEventHandlers,
      isActive,
      resolvedProps,
      resolvedClass,
      resolvedStyle,
    })
  })

  // Return the computed ref itself - callers should access .value
  return computedProps as unknown as LinkHTMLAttributes
}

// [href, active] of an internal Link.
type LinkState = [href: string | undefined, isActive: boolean]

// Options that decide where and how a Link navigates.
const NAVIGATION_KEYS = [
  'to',
  'replace',
  'resetScroll',
  'hashScrollIntoView',
  'startTransition',
  'viewTransition',
  'ignoreBlocker',
  'params',
  'search',
  'hash',
  'state',
  'mask',
  'unsafeRelative',
  'from',
  'href',
] as const

function resolveStyleProps(options: AnyLinkPropsOptions, isActive: boolean) {
  const props =
    (isActive ? options.activeProps : options.inactiveProps) ||
    (isActive ? STATIC_ACTIVE_PROPS : EMPTY_OBJECT)
  const resolvedProps: StyledProps =
    (typeof props === 'function' ? props() : props) || EMPTY_OBJECT
  const baseClass = options.class
  const stateClass = resolvedProps.class
  const resolvedClass = baseClass
    ? stateClass
      ? [baseClass, stateClass]
      : baseClass
    : stateClass
      ? stateClass
      : undefined

  const baseStyle = options.style
  const stateStyle = resolvedProps.style
  let resolvedStyle: Record<string, string | number> | undefined
  if (baseStyle || stateStyle) {
    // Keep a snapshot of reactive styles rather than returning their proxy.
    const style: Record<string, string | number> = {}
    Object.assign(style, baseStyle, stateStyle)
    if (hasKeys(style)) {
      resolvedStyle = style
    }
  }
  return {
    resolvedProps,
    resolvedClass,
    resolvedStyle,
  }
}

const STATIC_ACTIVE_PROPS = { class: 'active' }
const EMPTY_OBJECT = {}

function combineResultProps({
  href,
  options,
  isActive,
  resolvedProps,
  resolvedClass,
  resolvedStyle,
  ref,
  staticEventHandlers,
}: {
  initial?: LinkHTMLAttributes
  href: string | undefined
  options: AnyLinkPropsOptions
  isActive: boolean
  resolvedProps: StyledProps
  resolvedClass?: StyledProps['class']
  resolvedStyle?: Record<string, string | number>
  ref?: Vue.VNodeRef | undefined
  staticEventHandlers?: LinkEventHandlers
}) {
  const disabled = options.disabled || href === undefined
  const result: Record<string, unknown> = {
    ...getPropsSafeToSpread(options),
    ref,
    ...staticEventHandlers,
    disabled: options._asChild ? disabled : undefined,
    target: options.target,
  }

  if (resolvedStyle) {
    result.style = resolvedStyle
  }

  if (resolvedClass) {
    result.class = resolvedClass
  }

  if (disabled) {
    result.role = 'link'
    result['aria-disabled'] = true
  }

  if (isActive) {
    result['data-status'] = 'active'
    result['aria-current'] = 'page'
  }

  for (const key of Object.keys(resolvedProps)) {
    if (key !== 'class' && key !== 'style') {
      result[key] = resolvedProps[key]
    }
  }

  result.href = href
  return result
}

function getExternalLinkProps(
  options: AnyLinkPropsOptions,
  router: AnyRouter,
  ref?: Vue.Ref<Element | null>,
  staticEventHandlers?: LinkEventHandlers,
): LinkHTMLAttributes {
  const dangerous = isDangerousProtocol(
    options.to as string,
    router.protocolAllowlist,
  )
  const disabled = options.disabled || dangerous
  if (process.env.NODE_ENV !== 'production' && dangerous) {
    console.warn(`Blocked Link with dangerous protocol: ${options.to}`)
  }

  const eventHandlers = getLinkEventHandlers(options as LinkEventOptions)
  const result: Record<string, unknown> = {
    ...getPropsSafeToSpread(options),
    ref,
    href: disabled ? undefined : options.to,
    target: options.target,
    disabled: options._asChild ? disabled : undefined,
    style: options.style,
    class: options.class,
    onClick: staticEventHandlers?.onClick ?? options.onClick,
    onBlur: staticEventHandlers?.onBlur ?? options.onBlur,
    onFocus: staticEventHandlers?.onFocus ?? options.onFocus,
    onMouseenter:
      staticEventHandlers?.onMouseenter ?? eventHandlers.onMouseenter,
    onMouseleave:
      staticEventHandlers?.onMouseleave ?? eventHandlers.onMouseleave,
    onMouseover: staticEventHandlers?.onMouseover ?? eventHandlers.onMouseover,
    onMouseout: staticEventHandlers?.onMouseout ?? eventHandlers.onMouseout,
    onTouchstart:
      staticEventHandlers?.onTouchstart ?? eventHandlers.onTouchstart,
  }

  if (disabled) {
    result.role = 'link'
    result['aria-disabled'] = true
  }

  for (const key of Object.keys(result)) {
    if (result[key] === undefined) {
      delete result[key]
    }
  }

  return result as LinkHTMLAttributes
}

function getLinkEventHandlers(
  options: LinkEventOptions,
): VueStyleLinkEventHandlers {
  return {
    onMouseenter: options.onMouseEnter ?? options.onMouseenter,
    onMouseleave: options.onMouseLeave ?? options.onMouseleave,
    onMouseover: options.onMouseOver ?? options.onMouseover,
    onMouseout: options.onMouseOut ?? options.onMouseout,
    onTouchstart: options.onTouchStart ?? options.onTouchstart,
  }
}

// Options the Link consumes; every other option is an element prop.
const LINK_OPTION_KEYS = new Set<string>([
  ...NAVIGATION_KEYS,
  'activeProps',
  'inactiveProps',
  'activeOptions',
  'preload',
  'preloadDelay',
  'preloadIntentProximity',
  'children',
  'target',
  'disabled',
  'style',
  'class',
  'onClick',
  'onBlur',
  'onFocus',
  'onMouseEnter',
  'onMouseenter',
  'onMouseLeave',
  'onMouseleave',
  'onMouseOver',
  'onMouseover',
  'onMouseOut',
  'onMouseout',
  'onTouchStart',
  'onTouchstart',
  'reloadDocument',
  '_asChild',
  'additionalProps',
])

const getPropsSafeToSpread = (options: AnyLinkPropsOptions) => {
  const propsSafeToSpread: Record<string, unknown> = {}
  for (const key in options) {
    if (!LINK_OPTION_KEYS.has(key)) {
      propsSafeToSpread[key] = (options as Record<string, unknown>)[key]
    }
  }
  return propsSafeToSpread
}

function getIsActive(
  loc: {
    pathname: string
    search: any
    hash: string
  },
  nextLoc: {
    pathname: string
    search: any
    hash: string
  },
  activeOptions: LinkOptions['activeOptions'],
  router: AnyRouter,
) {
  const currentPath = removeTrailingSlash(loc.pathname, router.basepath)
  const nextPath = removeTrailingSlash(nextLoc.pathname, router.basepath)

  // Both modes compare normalized paths; fuzzy matches need a segment boundary.
  if (
    activeOptions?.exact
      ? currentPath !== nextPath
      : !(
          currentPath.startsWith(nextPath) &&
          (currentPath.length === nextPath.length ||
            currentPath[nextPath.length] === '/')
        )
  ) {
    return false
  }

  if (activeOptions?.includeSearch ?? true) {
    const searchTest = deepEqual(
      loc.search,
      nextLoc.search,
      !activeOptions?.exact,
      activeOptions?.explicitUndefined,
    )
    if (!searchTest) {
      return false
    }
  }

  if (activeOptions?.includeHash) {
    return loc.hash === nextLoc.hash
  }
  return true
}

function getHref(
  options: AnyLinkPropsOptions,
  router: AnyRouter,
  nextLocation?: ParsedLocation,
) {
  if (options.disabled) {
    return undefined
  }
  const location = nextLocation?.maskedLocation ?? nextLocation

  // Use publicHref - it contains the correct href for display
  // When a rewrite changes the origin, publicHref is the full URL
  // Otherwise it's the origin-stripped path
  // This avoids constructing URL objects in the hot path
  const publicHref = location?.publicHref
  if (!publicHref) return undefined

  const href = location?.external
    ? publicHref
    : router.history.createHref(publicHref) || '/'
  if (
    (location?.external || href !== publicHref) &&
    isDangerousProtocol(href, router.protocolAllowlist)
  ) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`Blocked Link with dangerous protocol: ${href}`)
    }
    return undefined
  }

  return href
}

// Type definitions
export type UseLinkPropsOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '.',
> = ActiveLinkOptions<'a', TRouter, TFrom, TTo, TMaskFrom, TMaskTo> &
  LinkHTMLAttributes

export type ActiveLinkOptions<
  TComp = 'a',
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = LinkOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> &
  ActiveLinkOptionProps<TComp>

type ActiveLinkProps<TComp> = Partial<
  (TComp extends keyof HTMLElementTagNameMap
    ? LinkHTMLAttributes
    : PropsOfComponent<TComp>) & {
    [key: `data-${string}`]: unknown
  }
>

export interface ActiveLinkOptionProps<TComp = 'a'> {
  /**
   * A function that returns additional props for the `active` state of this link.
   * These props override other props passed to the link (`style`'s are merged, `class`'s are concatenated)
   */
  activeProps?: ActiveLinkProps<TComp> | (() => ActiveLinkProps<TComp>)
  /**
   * A function that returns additional props for the `inactive` state of this link.
   * These props override other props passed to the link (`style`'s are merged, `class`'s are concatenated)
   */
  inactiveProps?: ActiveLinkProps<TComp> | (() => ActiveLinkProps<TComp>)
}

export type LinkProps<
  TComp = 'a',
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = ActiveLinkOptions<TComp, TRouter, TFrom, TTo, TMaskFrom, TMaskTo> &
  LinkPropsChildren

export interface LinkPropsChildren {
  // If a function is passed as a child, it will be given the `isActive` boolean to aid in further styling on the element it returns
  children?: Vue.VNodeChild | ((state: { isActive: boolean }) => Vue.VNodeChild)
}

type LinkComponentVueProps<TComp> = TComp extends keyof HTMLElementTagNameMap
  ? Omit<LinkHTMLAttributes, keyof CreateLinkProps>
  : Omit<PropsOfComponent<TComp>, keyof CreateLinkProps>

export type LinkComponentProps<
  TComp = 'a',
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = LinkComponentVueProps<TComp> &
  LinkProps<TComp, TRouter, TFrom, TTo, TMaskFrom, TMaskTo>

export type CreateLinkProps = LinkProps<
  any,
  any,
  string,
  string,
  string,
  string
>

export type LinkComponent<
  in out TComp,
  in out TDefaultFrom extends string = string,
> = <
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string = TDefaultFrom,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(
  props: LinkComponentProps<TComp, TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
) => Vue.VNode

export interface LinkComponentRoute<
  in out TDefaultFrom extends string = string,
> {
  defaultFrom: TDefaultFrom;
  <
    TRouter extends AnyRouter = RegisteredRouter,
    const TTo extends string | undefined = undefined,
    const TMaskTo extends string = '',
  >(
    props: LinkComponentProps<
      'a',
      TRouter,
      this['defaultFrom'],
      TTo,
      this['defaultFrom'],
      TMaskTo
    >,
  ): Vue.VNode
}

export function createLink<const TComp>(
  Comp: Constrain<TComp, any, (props: CreateLinkProps) => Vue.VNode>,
): LinkComponent<TComp> {
  return Vue.defineComponent({
    name: 'CreatedLink',
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      return () => Vue.h(LinkImpl, { ...attrs, _asChild: Comp }, slots)
    },
  }) as any
}

function useLinkPropsSnapshot(
  props: Record<string, unknown>,
  attrs: Record<string, unknown>,
) {
  const attrsSnapshot = Vue.shallowRef({ ...attrs })
  Vue.onBeforeUpdate(() => {
    const keys = Object.keys(attrs)
    const previous = attrsSnapshot.value
    if (
      keys.length !== Object.keys(previous).length ||
      keys.some((key) => !Object.is(attrs[key], previous[key]))
    ) {
      attrsSnapshot.value = { ...attrs }
    }
  })

  // Keep a plain cached snapshot so location-only updates do not repeatedly
  // cross Vue's props and attrs proxies for every link computation.
  const allProps = Vue.computed(
    () =>
      ({
        ...props,
        ...attrsSnapshot.value,
      }) as AnyLinkPropsOptions,
  )
  return () => allProps.value
}

const LinkImpl = Vue.defineComponent({
  name: 'Link',
  inheritAttrs: false,
  props: [
    '_asChild',
    'to',
    'preload',
    'preloadDelay',
    'preloadIntentProximity',
    'activeProps',
    'inactiveProps',
    'activeOptions',
    'from',
    'search',
    'params',
    'hash',
    'state',
    'mask',
    'reloadDocument',
    'disabled',
    'additionalProps',
    'viewTransition',
    'resetScroll',
    'startTransition',
    'hashScrollIntoView',
    'replace',
    'ignoreBlocker',
    'target',
  ],
  setup(props, { attrs, slots }) {
    // The server renders once: read the props directly.
    const linkPropsSource = useLinkPropsImpl(
      (isServer ?? useRouter()?.isServer)
        ? () => ({ ...props, ...attrs })
        : useLinkPropsSnapshot(props, attrs),
    ) as LinkHTMLAttributes | Vue.ComputedRef<LinkHTMLAttributes>

    return () => {
      const Component = props._asChild || 'a'

      const linkProps = Vue.unref(linkPropsSource)

      const isActive = linkProps['data-status'] === 'active'

      // Create the slot content or empty array if no default slot
      const slotContent = slots.default ? slots.default({ isActive }) : []

      // Special handling for SVG links - wrap an <a> inside the SVG
      if (Component === 'svg') {
        // Create props without class for svg link
        const svgLinkProps = { ...linkProps }
        delete svgLinkProps.class
        return Vue.h('svg', {}, [Vue.h('a', svgLinkProps, slotContent)])
      }

      // For custom functional components (non-string), pass children as a prop
      // since they may expect children as a prop like in Solid
      if (typeof Component !== 'string') {
        return Vue.h(
          Component,
          { ...linkProps, children: slotContent },
          slotContent,
        )
      }

      // Vue normalizes class bindings in place; preserve the cached bindings.
      return Vue.h(Component, { ...linkProps }, slotContent)
    }
  },
})

/**
 * Link component with proper TypeScript generics support
 */
export const Link = LinkImpl as unknown as Vue.Component<unknown> &
  Vue.Component<CreateLinkProps> &
  LinkComponent<'a'>

export type LinkOptionsFnOptions<
  TOptions,
  TComp,
  TRouter extends AnyRouter = RegisteredRouter,
> =
  TOptions extends ReadonlyArray<any>
    ? ValidateLinkOptionsArray<TRouter, TOptions, string, TComp>
    : ValidateLinkOptions<TRouter, TOptions, string, TComp>

export type LinkOptionsFn<TComp> = <
  const TOptions,
  TRouter extends AnyRouter = RegisteredRouter,
>(
  options: LinkOptionsFnOptions<TOptions, TComp, TRouter>,
) => TOptions

export const linkOptions: LinkOptionsFn<'a'> = (options) => {
  return options as any
}
