import * as Solid from 'solid-js'

import {
  _isRouteDeparting,
  deepEqual,
  functionalUpdate,
  getUrlScheme,
  hasKeys,
  isDangerousProtocol,
  preloadWarning,
  removeTrailingSlash,
} from '@tanstack/router-core'

import { isServer } from '@tanstack/router-core/isServer'
import { Dynamic } from 'solid-js/web'
import { useRouter } from './useRouter'
import { nearestMatchContext } from './matchContext'

import { useIntersectionObserver } from './utils'

import { useHydrated } from './ClientOnly'
import type {
  AnyRouter,
  Constrain,
  LinkOptions,
  ParsedLocation,
  RegisteredRouter,
  RoutePaths,
} from '@tanstack/router-core'
import type {
  ValidateLinkOptions,
  ValidateLinkOptionsArray,
} from './typePrimitives'

export function useLinkProps<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '',
>(
  options: UseLinkPropsOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
): Solid.ComponentProps<'a'> {
  return createLinkProps(options as any, LINK_OPTION_KEYS)
}

// `ownKeys` are the options that never reach the element.
function createLinkProps(
  options: UseLinkPropsOptions,
  ownKeys: ReadonlyArray<string>,
): Solid.ComponentProps<'a'> {
  const router = useRouter()
  // Options are read directly: one props proxy, no merged-default getters.
  const [, propsSafeToSpread] = Solid.splitProps(
    options,
    ownKeys as Array<keyof typeof options>,
  )

  // A live match never changes route, so read it once without tracking.
  const routeId = Solid.useContext(nearestMatchContext)[0 /* routeId */]()

  // While a publishing navigation leaves the Link's route, keep the location
  // the route still presents so the Link does no work. The route unmounts
  // when that navigation commits, and any other outcome publishes a newer
  // location. Compare by identity: a same-href navigation can change state.
  // The server renders one location: no reactivity there.
  const currentLocation =
    (isServer ?? router.isServer)
      ? () => router.stores.location.get()
      : Solid.createMemo((prev?: ParsedLocation) => {
          const location = router.stores.location.get()
          return prev && _isRouteDeparting(router, routeId, location)
            ? prev
            : location
        })

  // The Link's own destination options, replaced only when a destination prop
  // changes: the router reuses a location built from the same object without
  // reading the current location. A Solid store changes in place, so a store
  // prop value (checked one level deep, not nested) gets a fresh object per
  // location instead, re-reading the store at each navigation as before. A
  // mask holds destination options of its own, so its values are checked too.
  const getDest = () => {
    const dest: any = {}
    for (const key of NAVIGATION_KEYS) {
      const value = (dest[key] = (options as any)[key])
      if (
        isStore(value) ||
        (key === 'mask' && value && Object.values(value).some(isStore))
      ) {
        currentLocation()
      }
    }
    return dest
  }
  const dest =
    (isServer ?? router.isServer) ? getDest : Solid.createMemo(getDest)

  // Only a hydrating client renders the server's hash-less active state first.
  const hasHydrated =
    !(isServer ?? router.isServer) && router.options.ssr
      ? useHydrated()
      : undefined

  // Everything the Link derives from its destination and the location, in
  // one computation: [element href, external href (null when blocked),
  // active]. An unchanged result keeps its identity, so a navigation that
  // leaves the Link as it was notifies nothing downstream.
  const getLinkState = (prev?: LinkState): LinkState => {
    const location = currentLocation()
    const to = options.to
    const disabled = options.disabled
    const scheme = typeof to === 'string' && getUrlScheme(to)
    let href: string | undefined
    let external: string | null | undefined
    let active = false
    if (scheme) {
      if (router.protocolAllowlist.has(scheme)) {
        external = to
      } else {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`Blocked Link with dangerous protocol: ${to}`)
        }
        external = null
      }
    } else {
      const options_ = dest()
      // Clicks and preloads go where the href points.
      options_._fromLocation = location
      // untrack because router-core will also access stores, which are signals in solid
      const next = Solid.untrack(() => router.buildLocation(options_))
      if (!disabled) {
        // Use publicHref - it contains the correct href for display
        // When a rewrite changes the origin, publicHref is the full URL
        // Otherwise it's the origin-stripped path
        // This avoids constructing URL objects in the hot path
        const shown = next.maskedLocation ?? next
        const publicHref = shown.publicHref
        const shownHref = shown.external
          ? publicHref
          : router.history.createHref(publicHref) || '/'
        if (
          (shown.external || shownHref !== publicHref) &&
          isDangerousProtocol(shownHref, router.protocolAllowlist)
        ) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn(`Blocked Link with dangerous protocol: ${shownHref}`)
          }
        } else {
          href = shownHref
        }
      }
      external =
        !href && !disabled
          ? null
          : href && getUrlScheme(href)
            ? href
            : undefined
      if (external === undefined) {
        const activeOptions = options.activeOptions
        const currentPath = removeTrailingSlash(
          location.pathname,
          router.basepath,
        )
        const nextPath = removeTrailingSlash(next.pathname, router.basepath)
        // Both modes compare normalized paths; fuzzy matches need a segment boundary.
        active =
          (activeOptions?.exact
            ? currentPath === nextPath
            : currentPath.startsWith(nextPath) &&
              (currentPath.length === nextPath.length ||
                currentPath[nextPath.length] === '/')) &&
          (!(activeOptions?.includeSearch ?? true) ||
            deepEqual(
              location.search,
              next.search,
              !activeOptions?.exact,
              activeOptions?.explicitUndefined,
            )) &&
          (!activeOptions?.includeHash ||
            (hasHydrated && !hasHydrated() ? '' : location.hash) === next.hash)
      }
    }
    href = external === null ? undefined : external || href
    return prev &&
      prev[0 /* href */] === href &&
      prev[1 /* external */] === external &&
      prev[2 /* active */] === active
      ? prev
      : [href, external, active]
  }
  const linkState =
    (isServer ?? router.isServer)
      ? getLinkState
      : Solid.createMemo(getLinkState)

  type ResolvedLinkStateProps = Omit<Solid.ComponentProps<'a'>, 'style'> & {
    style?: Solid.JSX.CSSProperties
  }

  const resolveLinkStateProps = (
    [href, external, active]: LinkState,
    base: Solid.ComponentProps<'a'> & { disabled?: boolean },
  ) => {
    const disabled = options.disabled || external === null
    base.href = href
    base.disabled = disabled
    base.target = options.target
    if (disabled) {
      Object.assign(base, STATIC_DISABLED_PROPS)
    }

    if (
      options.activeProps === undefined &&
      options.inactiveProps === undefined &&
      options.class === undefined &&
      options.style === undefined
    ) {
      return active
        ? Object.assign(base, STATIC_DEFAULT_ACTIVE_ATTRIBUTES)
        : base
    }

    const stateProps: ResolvedLinkStateProps =
      functionalUpdate(
        (active ? options.activeProps : options.inactiveProps) ??
          (active ? STATIC_ACTIVE_PROPS : EMPTY_OBJECT),
        {},
      ) ?? EMPTY_OBJECT
    const baseStyle = options.style
    const stateStyle = stateProps.style
    // Snapshot reactive style properties so in-place updates remain observable.
    const style =
      baseStyle || stateStyle ? { ...baseStyle, ...stateStyle } : undefined
    const baseClass = options.class
    const stateClass = stateProps.class
    const className = baseClass
      ? stateClass
        ? `${baseClass} ${stateClass}`
        : baseClass
      : stateClass

    return {
      ...base,
      ...stateProps,
      // State props can override element props, but not routing options.
      href,
      disabled,
      target: base.target,
      ...(style && hasKeys(style) && { style }),
      ...(className && { class: className }),
      ...(active && STATIC_ACTIVE_ATTRIBUTES),
    } as ResolvedLinkStateProps
  }

  // Keep the guard inline so browser builds can drop the server return.
  if (isServer ?? router.isServer) {
    const props = resolveLinkStateProps(linkState(), {
      onClick: options.onClick,
      onBlur: options.onBlur,
      onFocus: options.onFocus,
      onMouseEnter: options.onMouseEnter,
      onMouseLeave: options.onMouseLeave,
      onMouseOut: options.onMouseOut,
      onMouseOver: options.onMouseOver,
      onTouchStart: options.onTouchStart,
      ref: options.ref,
    })
    // Avoid creating merged-prop getters for absent server event handlers.
    for (const key of STATIC_EVENT_PROPS) {
      if (props[key] === undefined) {
        delete props[key]
      }
    }
    return Solid.mergeProps(propsSafeToSpread, props) as any
  }

  let hasRenderFetched = false

  const preload = () =>
    !options.reloadDocument &&
    linkState()[1 /* external */] === undefined &&
    !options.disabled &&
    (options.preload ?? router.options.defaultPreload)
  const preloadDelay = () =>
    options.preloadDelay ?? router.options.defaultPreloadDelay ?? 0

  const doPreload = () =>
    router.preloadRoute(dest()).catch((err: any) => {
      console.warn(err)
      console.warn(preloadWarning)
    })

  const [ref, setRef] = Solid.createSignal<Element | null>(null)

  let preloadTimeout: ReturnType<typeof setTimeout> | undefined
  const cancelPreload = () => {
    clearTimeout(preloadTimeout)
    preloadTimeout = undefined
  }

  const enqueuePreload = (
    e?: MouseEvent | FocusEvent | IntersectionObserverEntry,
  ) => {
    if (!e) {
      cancelPreload()
      return
    }

    if (
      !(
        (e as IntersectionObserverEntry).isIntersecting ??
        preload() === 'intent'
      )
    ) {
      if ((e as IntersectionObserverEntry).isIntersecting === false) {
        cancelPreload()
      }
      return
    }

    if (!preloadDelay()) {
      doPreload()
      return
    }

    preloadTimeout ??= setTimeout(() => {
      preloadTimeout = undefined
      doPreload()
    }, preloadDelay())
  }

  useIntersectionObserver(ref, enqueuePreload, preload)

  Solid.createEffect(() => {
    if (hasRenderFetched) {
      return
    }
    if (preload() === 'render') {
      doPreload()
      hasRenderFetched = true
    }
  })

  // The click handler
  const handleClick = (e: MouseEvent) => {
    // Check actual element's target attribute as fallback
    const elementTarget = (
      e.currentTarget as HTMLAnchorElement | SVGAElement
    ).getAttribute('target')
    const effectiveTarget =
      options.target !== undefined ? options.target : elementTarget

    if (
      !options.disabled &&
      linkState()[1 /* external */] === undefined &&
      !(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) &&
      !e.defaultPrevented &&
      (!effectiveTarget || effectiveTarget === '_self') &&
      e.button === 0
    ) {
      e.preventDefault()
      cancelPreload()

      // All is well? Navigate!
      // N.B. we don't call `router.commitLocation(next) here because we want to run `validateSearch` before committing
      router.navigate(dest())
    }
  }

  const handleTouchStart = () => {
    if (preload() !== 'intent') return
    doPreload()
  }

  const handleLeave = () => {
    if (preload() === 'intent') {
      cancelPreload()
    }
  }

  const onClick = createComposedHandler(() => options.onClick, handleClick)
  const onBlur = createComposedHandler(() => options.onBlur, handleLeave)
  const onFocus = createComposedHandler(() => options.onFocus, enqueuePreload)
  const onMouseEnter = createComposedHandler(
    () => options.onMouseEnter,
    enqueuePreload,
  )
  const onMouseOver = createComposedHandler(
    () => options.onMouseOver,
    enqueuePreload,
  )
  const onMouseLeave = createComposedHandler(
    () => options.onMouseLeave,
    handleLeave,
  )
  const onMouseOut = createComposedHandler(
    () => options.onMouseOut,
    handleLeave,
  )
  const onTouchStart = createComposedHandler(
    () => options.onTouchStart,
    handleTouchStart,
  )

  // One ref callback per element. The selected state props' ref, else the
  // Link's own, receives the element once; a state change does not re-call it.
  const linkRef = (el: Element) => {
    setRef(el)
    const ref = resolved.ref ?? options.ref
    if (typeof ref === 'function') {
      ref(el as HTMLAnchorElement)
    }
  }

  // `mergeProps` memoizes this itself; the ref reads its latest result.
  let resolved: Solid.ComponentProps<'a'>
  const resolvedProps = () =>
    (resolved = resolveLinkStateProps(linkState(), {
      onClick,
      onBlur,
      onFocus,
      onMouseEnter,
      onMouseOver,
      onMouseLeave,
      onMouseOut,
      onTouchStart,
    }))

  // The ref sits after the memo so reading it does not track the memo: the
  // element's ref effect then runs once.
  return Solid.mergeProps(propsSafeToSpread, resolvedProps, {
    ref: linkRef,
  }) as any
}

// [element href, external href (null when blocked), active]
type LinkState = [
  href: string | undefined,
  external: string | null | undefined,
  active: boolean,
]

const isStore = (value: any): boolean => !!value?.[Solid.$PROXY]

// Props that decide where and how a Link navigates.
const NAVIGATION_KEYS = [
  'to',
  'reloadDocument',
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
// Options the Link consumes; every other option is an element prop.
const LINK_OPTION_KEYS = [
  ...NAVIGATION_KEYS,
  'activeProps',
  'inactiveProps',
  'activeOptions',
  'preload',
  'preloadDelay',
  'preloadIntentProximity',
  'target',
  'disabled',
  'style',
  'class',
  'onClick',
  'onBlur',
  'onFocus',
  'onMouseEnter',
  'onMouseLeave',
  'onMouseOver',
  'onMouseOut',
  'onTouchStart',
]
// A Link also consumes its children and component, and drops `type`.
const LINK_ELEMENT_KEYS = [...LINK_OPTION_KEYS, '_asChild', 'children', 'type']
const STATIC_EVENT_PROPS = [
  'onClick',
  'onBlur',
  'onFocus',
  'onMouseEnter',
  'onMouseLeave',
  'onMouseOut',
  'onMouseOver',
  'onTouchStart',
] as const
const STATIC_ACTIVE_PROPS = { class: 'active' }
const EMPTY_OBJECT = {}
const STATIC_DEFAULT_ACTIVE_ATTRIBUTES = {
  class: 'active',
  'data-status': 'active',
  'aria-current': 'page',
}
const STATIC_DISABLED_PROPS = {
  role: 'link' as const,
  'aria-disabled': true,
}
const STATIC_ACTIVE_ATTRIBUTES = {
  'data-status': 'active',
  'aria-current': 'page',
}

/** Call a JSX.EventHandlerUnion with the event. */
function callHandler<T, TEvent extends Event>(
  event: TEvent & { currentTarget: T; target: Element },
  handler: Solid.JSX.EventHandlerUnion<T, TEvent>,
) {
  if (typeof handler === 'function') {
    handler(event)
  } else {
    handler[0](handler[1], event)
  }
  return event.defaultPrevented
}

function createComposedHandler<T, TEvent extends Event>(
  getHandler: () => Solid.JSX.EventHandlerUnion<T, TEvent> | undefined,
  fallback: (event: TEvent) => void,
) {
  return (event: TEvent & { currentTarget: T; target: Element }) => {
    const handler = getHandler()
    if (!handler || !callHandler(event, handler)) fallback(event)
  }
}

export type UseLinkPropsOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '.',
> = ActiveLinkOptions<'a', TRouter, TFrom, TTo, TMaskFrom, TMaskTo> &
  Omit<Solid.ComponentProps<'a'>, 'style'> & { style?: Solid.JSX.CSSProperties }

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
  LinkComponentSolidProps<TComp> & {
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
  children?:
    | Solid.JSX.Element
    | ((state: { isActive: boolean }) => Solid.JSX.Element)
}

type LinkComponentSolidProps<TComp> = TComp extends Solid.ValidComponent
  ? Omit<Solid.ComponentProps<TComp>, keyof CreateLinkProps>
  : never

export type LinkComponentProps<
  TComp = 'a',
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = LinkComponentSolidProps<TComp> &
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
) => Solid.JSX.Element

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
  ): Solid.JSX.Element
}

export function createLink<const TComp>(
  Comp: Constrain<TComp, any, (props: CreateLinkProps) => Solid.JSX.Element>,
): LinkComponent<TComp> {
  return (props) => <Link {...props} _asChild={Comp} />
}

export const Link: LinkComponent<'a'> = (props) => {
  const local = props as typeof props & { _asChild: any }
  // One props proxy between the element and the Link's props.
  const linkProps = createLinkProps(props as any, LINK_ELEMENT_KEYS)

  // Element insertion tracks this itself; only a custom component, which may
  // read its children more than once, gets a memo.
  const children = () => {
    const ch = local.children
    if (typeof ch === 'function') {
      return ch({
        get isActive() {
          return (linkProps as any)['data-status'] === 'active'
        },
      })
    }

    return ch satisfies Solid.JSX.Element
  }

  if (local._asChild === 'svg') {
    const [_, svgLinkProps] = Solid.splitProps(linkProps, ['class'])
    return (
      <svg>
        <a {...svgLinkProps}>{children()}</a>
      </svg>
    )
  }

  if (!local._asChild) {
    return <a {...linkProps}>{children()}</a>
  }

  const memo = Solid.createMemo(children)
  return (
    <Dynamic component={local._asChild as Solid.ValidComponent} {...linkProps}>
      {memo()}
    </Dynamic>
  )
}

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
