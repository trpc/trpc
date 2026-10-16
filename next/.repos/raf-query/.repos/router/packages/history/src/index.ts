// While the public API was clearly inspired by the "history" npm package,
// This implementation attempts to be more lightweight by
// making assumptions about the way TanStack Router works

export interface NavigateOptions {
  ignoreBlocker?: boolean
}

type SubscriberHistoryAction =
  | {
      type: Exclude<HistoryAction, 'GO'>
    }
  | {
      type: 'GO'
      index: number
    }

type SubscriberArgs = {
  location: HistoryLocation
  action: SubscriberHistoryAction
}

export interface RouterHistory {
  location: HistoryLocation
  length: number
  subscribers: Set<(opts: SubscriberArgs) => void>
  subscribe: (cb: (opts: SubscriberArgs) => void) => () => void
  push: (path: string, state?: any, navigateOpts?: NavigateOptions) => void
  replace: (path: string, state?: any, navigateOpts?: NavigateOptions) => void
  go: (index: number, navigateOpts?: NavigateOptions) => void
  back: (navigateOpts?: NavigateOptions) => void
  forward: (navigateOpts?: NavigateOptions) => void
  canGoBack: () => boolean
  createHref: (href: string) => string
  block: (blocker: NavigationBlocker) => () => void
  flush: () => void
  destroy: () => void
  notify: (action: SubscriberHistoryAction) => void
  _getBlockers: () => Array<NavigationBlocker>
  _ignoreSubscribers?: boolean
  _ignoreNextBeforeUnload?: (href: string) => void
}

export interface HistoryLocation extends ParsedPath {
  state: ParsedHistoryState
}

export interface ParsedPath {
  href: string
  pathname: string
  search: string
  hash: string
}

export interface HistoryState {}

export type ParsedHistoryState = HistoryState & {
  key?: string // TODO: Remove in v2 - use __TSR_key instead
  __TSR_key?: string
  __TSR_index: number
}

type ShouldAllowNavigation = any

export type HistoryAction = 'PUSH' | 'REPLACE' | 'FORWARD' | 'BACK' | 'GO'

export type BlockerFnArgs = {
  currentLocation: HistoryLocation
  nextLocation: HistoryLocation
  action: HistoryAction
}

export type BlockerFn = (
  args: BlockerFnArgs,
) => Promise<ShouldAllowNavigation> | ShouldAllowNavigation

export type NavigationBlocker = {
  blockerFn: BlockerFn
  enableBeforeUnload?: (() => boolean) | boolean
}

type TryNavigateArgs = {
  task: () => void
  type: 'PUSH' | 'REPLACE' | 'BACK' | 'FORWARD' | 'GO'
  navigateOpts?: NavigateOptions
} & (
  | {
      type: 'PUSH' | 'REPLACE'
      path: string
      state: any
    }
  | {
      type: 'BACK' | 'FORWARD' | 'GO'
    }
)

const stateIndexKey = '__TSR_index'
const popStateEvent = 'popstate'
const beforeUnloadEvent = 'beforeunload'

/**
 * Turn protocol-relative inputs such as "//evil.example" into paths
 * such as "/evil.example", keeping navigation on the current origin.
 *
 * For HTTP(S) URLs, WHATWG parsing ignores leading C0 controls and spaces,
 * removes tabs/newlines, and treats backslashes as slashes, so inputs like
 * "/\evil.example" also need normalization. This only allocates when those
 * rules would make the input protocol-relative.
 */
// eslint-disable-next-line no-control-regex
const protocolRelativePrefix = /^[\x00-\x20]*(?:[\\/][\t\n\r]*){2,}/

export function normalizeProtocolRelative(url: string): string {
  const match = protocolRelativePrefix.exec(url)
  return match ? '/' + url.slice(match[0].length) : url
}

function normalizeHref(href: string): string {
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(href)) {
    // eslint-disable-next-line no-control-regex
    href = href.replace(/[\x00-\x1f\x7f]/g, (character) =>
      '\t\n\r'.includes(character) ? '' : encodeURIComponent(character),
    )
  }
  return normalizeProtocolRelative(href)
}

export function createHistory(opts: {
  getLocation: () => HistoryLocation
  getLength: () => number
  pushState: (path: string, state: any) => void
  replaceState: (path: string, state: any) => void
  go: (n: number, ignoreBlocker: boolean) => void
  back: (ignoreBlocker: boolean) => void
  forward: (ignoreBlocker: boolean) => void
  createHref: (path: string) => string
  flush?: () => void
  destroy?: () => void
  onBlocked?: () => void
  getBlockers?: () => Array<NavigationBlocker>
  setBlockers?: (blockers: Array<NavigationBlocker>) => void
  // Avoid notifying on forward/back/go, used for browser history as we already get notified by the popstate event
  notifyOnIndexChange?: boolean
}): RouterHistory {
  let location = opts.getLocation()
  const subscribers = new Set<(opts: SubscriberArgs) => void>()

  const notify = (action: SubscriberHistoryAction) => {
    location = opts.getLocation()
    subscribers.forEach((subscriber) => subscriber({ location, action }))
  }

  const handleIndexChange = (action: SubscriberHistoryAction) => {
    if (opts.notifyOnIndexChange ?? true) notify(action)
    else location = opts.getLocation()
  }

  const tryNavigation = async (args: TryNavigateArgs) => {
    const blockers = args.navigateOpts?.ignoreBlocker
      ? undefined
      : opts.getBlockers?.()
    if (
      typeof document !== 'undefined' &&
      blockers?.length &&
      (args.type === 'PUSH' || args.type === 'REPLACE')
    ) {
      for (const blocker of blockers) {
        const nextLocation = parseHref(args.path, args.state)
        const isBlocked = await blocker.blockerFn({
          currentLocation: location,
          nextLocation,
          action: args.type,
        })
        if (isBlocked) {
          opts.onBlocked?.()
          return
        }
      }
    }

    args.task()
  }

  return {
    get location() {
      return location
    },
    get length() {
      return opts.getLength()
    },
    subscribers,
    subscribe: (cb: (opts: SubscriberArgs) => void) => {
      subscribers.add(cb)

      return () => {
        subscribers.delete(cb)
      }
    },
    push: (path, state, navigateOpts) => {
      const currentIndex = location.state[stateIndexKey]
      state = assignKeyAndIndex(currentIndex + 1, state)
      tryNavigation({
        task: () => {
          opts.pushState(path, state)
          notify({ type: 'PUSH' })
        },
        navigateOpts,
        type: 'PUSH',
        path,
        state,
      })
    },
    replace: (path, state, navigateOpts) => {
      const currentIndex = location.state[stateIndexKey]
      state = assignKeyAndIndex(currentIndex, state)
      tryNavigation({
        task: () => {
          opts.replaceState(path, state)
          notify({ type: 'REPLACE' })
        },
        navigateOpts,
        type: 'REPLACE',
        path,
        state,
      })
    },
    go: (index, navigateOpts) => {
      tryNavigation({
        task: () => {
          opts.go(index, navigateOpts?.ignoreBlocker ?? false)
          handleIndexChange({ type: 'GO', index })
        },
        navigateOpts,
        type: 'GO',
      })
    },
    back: (navigateOpts) => {
      tryNavigation({
        task: () => {
          opts.back(navigateOpts?.ignoreBlocker ?? false)
          handleIndexChange({ type: 'BACK' })
        },
        navigateOpts,
        type: 'BACK',
      })
    },
    forward: (navigateOpts) => {
      tryNavigation({
        task: () => {
          opts.forward(navigateOpts?.ignoreBlocker ?? false)
          handleIndexChange({ type: 'FORWARD' })
        },
        navigateOpts,
        type: 'FORWARD',
      })
    },
    canGoBack: () => location.state[stateIndexKey] !== 0,
    createHref: (str) => opts.createHref(str),
    block: (blocker) => {
      if (!opts.setBlockers) return () => {}
      const blockers = opts.getBlockers?.() ?? []
      opts.setBlockers([...blockers, blocker])

      return () => {
        const blockers = opts.getBlockers?.() ?? []
        opts.setBlockers?.(blockers.filter((b) => b !== blocker))
      }
    },
    flush: () => opts.flush?.(),
    destroy: () => opts.destroy?.(),
    notify,
    _getBlockers: () => opts.getBlockers?.() ?? [],
  }
}

function assignKeyAndIndex(index: number, state: HistoryState | undefined) {
  const key = createRandomKey()
  return {
    ...state,
    key, // TODO: Remove in v2 - use __TSR_key instead
    __TSR_key: key,
    [stateIndexKey]: index,
  } as ParsedHistoryState
}

/**
 * Creates a history object that can be used to interact with the browser's
 * navigation. This is a lightweight API wrapping the browser's native methods.
 * It is designed to work with TanStack Router, but could be used as a standalone API as well.
 * IMPORTANT: This API implements history throttling via a microtask to prevent
 * excessive calls to the history API. In some browsers, calling history.pushState or
 * history.replaceState in quick succession can cause the browser to ignore subsequent
 * calls. This API smooths out those differences and ensures that your application
 * state will *eventually* match the browser state. In most cases, this is not a problem,
 * but if you need to ensure that the browser state is up to date, you can use the
 * `history.flush` method to immediately flush all pending state changes to the browser URL.
 * @param opts
 * @param opts.getHref A function that returns the current href (path + search + hash)
 * @param opts.createHref A function that takes a path and returns a href (path + search + hash)
 * @returns A history instance
 */
export function createBrowserHistory(opts?: {
  parseLocation?: () => HistoryLocation
  createHref?: (path: string) => string
  window?: any
}): RouterHistory {
  const win =
    opts?.window ??
    (typeof document !== 'undefined' ? window : (undefined as any))

  const originalPushState = win.history.pushState
  const originalReplaceState = win.history.replaceState

  let blockers: Array<NavigationBlocker> = []
  const _getBlockers = () => blockers
  const _setBlockers = (newBlockers: Array<NavigationBlocker>) =>
    (blockers = newBlockers)

  const createHref = (path: string) =>
    normalizeHref(opts?.createHref ? opts.createHref(path) : path)
  const parseLocation =
    opts?.parseLocation ??
    (() =>
      parseHref(
        `${win.location.pathname}${win.location.search}${win.location.hash}`,
        win.history.state,
      ))

  // Ensure there is always a key to start
  if (!win.history.state?.__TSR_key && !win.history.state?.key) {
    const addedKey = createRandomKey()
    win.history.replaceState(
      {
        [stateIndexKey]: 0,
        key: addedKey, // TODO: Remove in v2 - use __TSR_key instead
        __TSR_key: addedKey,
      },
      '',
    )
  }

  let currentLocation = parseLocation()
  let rollbackLocation: HistoryLocation | undefined

  let nextPopIsGo = false
  let ignoreNextPop = false
  // TODO: An ignored traversal past a history boundary emits neither popstate
  // nor beforeunload, leaving these bypasses active for a later navigation.
  // The History API provides no completion signal for such no-op traversals.
  let skipBlockerNextPop = false
  let ignoreNextBeforeUnload = false

  const getLocation = () => currentLocation

  let next:
    | undefined
    | [
        // The latest location that we were attempting to push/replace
        href: string,
        // The latest state that we were attempting to push/replace
        state: any,
        // Whether any queued update needs to push rather than replace
        isPush: boolean,
      ]

  // This function flushes the next update to the browser history
  const flush = () => {
    if (!next) {
      return
    }

    // We need to ignore any updates to the subscribers while we update the browser history
    history._ignoreSubscribers = true

    // Update the browser history
    ;(next[2 /* is push */] ? win.history.pushState : win.history.replaceState)(
      next[1 /* state */],
      '',
      next[0 /* href */],
    )

    // Stop ignoring subscriber updates
    history._ignoreSubscribers = false

    // Clear the queued action after it reaches browser history.
    next = undefined
    rollbackLocation = undefined
  }

  // This function queues up a call to update the browser history
  const queueHistoryAction = (
    isPush: boolean,
    destHref: string,
    state: any,
  ) => {
    // A formatter changes the URL space and must receive the original input.
    // Otherwise parseHref below already produces the browser destination.
    const href = opts?.createHref ? createHref(destHref) : undefined
    const hasPendingAction = !!next

    if (!hasPendingAction) {
      rollbackLocation = currentLocation
    }

    // Keep the optimistic location in the router's logical URL space.
    currentLocation = parseHref(destHref, state)

    // Keep track of the next location we need to flush to the URL
    next = [
      href ?? currentLocation.href,
      state,
      next?.[2 /* is push */] || isPush,
    ]

    if (!hasPendingAction) {
      // Schedule an update to the browser history
      queueMicrotask(() => flush())
    }
  }

  // NOTE: this function can probably be removed
  const onPushPop = (type: 'PUSH' | 'REPLACE') => {
    currentLocation = parseLocation()
    history.notify({ type })
  }

  const onPushPopEvent = async () => {
    // Same-document traversals do not fire beforeunload, so consume their
    // exemption here instead of carrying it into a later document navigation.
    ignoreNextBeforeUnload = false

    if (ignoreNextPop) {
      ignoreNextPop = false
      return
    }

    const nextLocation = parseLocation()
    const delta =
      nextLocation.state[stateIndexKey] - currentLocation.state[stateIndexKey]
    const isForward = delta === 1
    const isBack = delta === -1
    const isGo = (!isForward && !isBack) || nextPopIsGo
    nextPopIsGo = false

    const action = isGo ? 'GO' : isBack ? 'BACK' : 'FORWARD'
    const notify: SubscriberHistoryAction = isGo
      ? {
          type: 'GO',
          index: delta,
        }
      : {
          type: isBack ? 'BACK' : 'FORWARD',
        }

    if (skipBlockerNextPop) {
      skipBlockerNextPop = false
    } else {
      const blockers = _getBlockers()
      if (typeof document !== 'undefined' && blockers.length) {
        for (const blocker of blockers) {
          const isBlocked = await blocker.blockerFn({
            currentLocation,
            nextLocation,
            action,
          })
          if (isBlocked) {
            ignoreNextPop = true
            win.history.go(-delta)
            history.notify(notify)
            return
          }
        }
      }
    }

    currentLocation = parseLocation()
    history.notify(notify)
  }

  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (ignoreNextBeforeUnload) {
      ignoreNextBeforeUnload = false
      return
    }

    let shouldBlock = false

    // If one blocker has a non-disabled beforeUnload, we should block
    const blockers = _getBlockers()
    if (typeof document !== 'undefined' && blockers.length) {
      for (const blocker of blockers) {
        const shouldHaveBeforeUnload = blocker.enableBeforeUnload ?? true
        if (shouldHaveBeforeUnload === true) {
          shouldBlock = true
          break
        }

        if (
          typeof shouldHaveBeforeUnload === 'function' &&
          shouldHaveBeforeUnload() === true
        ) {
          shouldBlock = true
          break
        }
      }
    }

    if (shouldBlock) {
      e.preventDefault()
      return (e.returnValue = '')
    }
    return
  }

  const history = createHistory({
    getLocation,
    getLength: () => win.history.length,
    pushState: (href, state) => queueHistoryAction(true, href, state),
    replaceState: (href, state) => queueHistoryAction(false, href, state),
    back: (ignoreBlocker) => {
      if (ignoreBlocker) {
        skipBlockerNextPop = true
        ignoreNextBeforeUnload = true
      }
      return win.history.back()
    },
    forward: (ignoreBlocker) => {
      if (ignoreBlocker) {
        skipBlockerNextPop = true
        ignoreNextBeforeUnload = true
      }
      win.history.forward()
    },
    go: (n, ignoreBlocker) => {
      nextPopIsGo = true
      if (ignoreBlocker) {
        skipBlockerNextPop = true
        ignoreNextBeforeUnload = true
      }
      win.history.go(n)
    },
    createHref,
    flush,
    destroy: () => {
      win.history.pushState = originalPushState
      win.history.replaceState = originalReplaceState
      win.removeEventListener(beforeUnloadEvent, onBeforeUnload, {
        capture: true,
      })
      win.removeEventListener(popStateEvent, onPushPopEvent)
    },
    onBlocked: () => {
      // If a navigation is blocked, we need to rollback the location
      // that we optimistically updated in memory.
      if (rollbackLocation && currentLocation !== rollbackLocation) {
        currentLocation = rollbackLocation
      }
    },
    getBlockers: _getBlockers,
    setBlockers: _setBlockers,
    notifyOnIndexChange: false,
  })

  history._ignoreNextBeforeUnload = (href) => {
    ignoreNextBeforeUnload = false
    try {
      href = new URL(href, win.document.baseURI).href
      // External handlers and same-document fragments may emit neither
      // beforeunload nor popstate, leaving an exemption for a later departure.
      ignoreNextBeforeUnload =
        /^https?:/.test(href) &&
        (!href.includes('#') ||
          href.split('#')[0] !== win.location.href.split('#')[0])
    } catch {
      // Invalid URLs cannot unload the document.
    }
  }

  win.addEventListener(beforeUnloadEvent, onBeforeUnload, { capture: true })
  win.addEventListener(popStateEvent, onPushPopEvent)

  win.history.pushState = function (...args: Array<any>) {
    const res = originalPushState.apply(win.history, args as any)
    if (!history._ignoreSubscribers) onPushPop('PUSH')
    return res
  }

  win.history.replaceState = function (...args: Array<any>) {
    const res = originalReplaceState.apply(win.history, args as any)
    if (!history._ignoreSubscribers) onPushPop('REPLACE')
    return res
  }

  return history
}

/**
 * Create a hash-based history implementation.
 * Useful for static hosts or environments without server URL rewriting.
 * @link https://tanstack.com/router/latest/docs/framework/react/guide/history-types
 */
export function createHashHistory(opts?: { window?: any }): RouterHistory {
  const win =
    opts?.window ??
    (typeof document !== 'undefined' ? window : (undefined as any))
  return createBrowserHistory({
    window: win,
    parseLocation: () => {
      // `#/path?query#fragment`: the router's own fragment starts at the
      // second '#'. A non-empty `location.hash` always starts with '#'.
      const hash = win.location.hash
      let hashIndex = hash.indexOf('#', 1)
      if (hashIndex < 0) {
        hashIndex = hash.length
      }
      return parseHref(
        `${hash ? hash.slice(1, hashIndex) : '/'}${win.location.search}${hash.slice(hashIndex)}`,
        win.history.state,
      )
    },
    createHref: (href) =>
      `${win.location.pathname}${win.location.search}#${href}`,
  })
}

/**
 * Create an in-memory history implementation.
 * Ideal for server rendering, tests, and non-DOM environments.
 * @link https://tanstack.com/router/latest/docs/framework/react/guide/history-types
 */
export function createMemoryHistory(
  opts: {
    initialEntries: Array<string>
    initialIndex?: number
  } = {
    initialEntries: ['/'],
  },
): RouterHistory {
  const entries = opts.initialEntries
  let index = opts.initialIndex
    ? Math.min(Math.max(opts.initialIndex, 0), entries.length - 1)
    : entries.length - 1
  const states = entries.map((_entry, index) =>
    assignKeyAndIndex(index, undefined),
  )

  const getLocation = () => parseHref(entries[index]!, states[index])

  let blockers: Array<NavigationBlocker> = []
  const _getBlockers = () => blockers
  const _setBlockers = (newBlockers: Array<NavigationBlocker>) =>
    (blockers = newBlockers)

  return createHistory({
    getLocation,
    getLength: () => entries.length,
    pushState: (path, state) => {
      // Removes all subsequent entries after the current index to start a new branch
      index = index < entries.length - 1 ? index + 1 : entries.length
      states[index] = state
      entries[index] = path
      if (index < entries.length - 1) {
        entries.length = index + 1
        states.length = index + 1
      }
    },
    replaceState: (path, state) => {
      states[index] = state
      entries[index] = path
    },
    back: () => {
      index = Math.max(index - 1, 0)
    },
    forward: () => {
      index = Math.min(index + 1, entries.length - 1)
    },
    go: (n) => {
      index = Math.min(Math.max(index + n, 0), entries.length - 1)
    },
    createHref: normalizeHref,
    getBlockers: _getBlockers,
    setBlockers: _setBlockers,
  })
}

const noop = () => {}

class ServerHistory implements RouterHistory {
  declare private _subscribers?: RouterHistory['subscribers']

  constructor(public location: HistoryLocation) {}

  get length() {
    return 1
  }

  // Preserve the history interface without allocating a Set for each request.
  get subscribers() {
    return (this._subscribers ??= new Set())
  }

  subscribe() {
    return noop
  }

  push() {}
  replace() {}
  go() {}
  back() {}
  forward() {}

  canGoBack() {
    return false
  }

  createHref(href: string) {
    return normalizeHref(href)
  }

  block() {
    return noop
  }

  flush() {}
  destroy() {}
  notify() {}

  _getBlockers(): Array<NavigationBlocker> {
    return []
  }
}

/** A fixed request location; server navigation is a no-op. */
export function createServerHistory(href: string): RouterHistory {
  return new ServerHistory(parseHref(href, undefined))
}

export function parseHref(
  href: string,
  state: ParsedHistoryState | undefined,
): HistoryLocation {
  const sanitizedHref = normalizeHref(href)
  const hashIndex = sanitizedHref.indexOf('#')
  const searchIndex = sanitizedHref.indexOf('?')
  if (!state) {
    const key = createRandomKey()
    state = { [stateIndexKey]: 0, key, __TSR_key: key }
  }

  return {
    href: sanitizedHref,
    pathname: sanitizedHref.slice(
      0,
      hashIndex > -1
        ? searchIndex > -1
          ? Math.min(hashIndex, searchIndex)
          : hashIndex
        : searchIndex > -1
          ? searchIndex
          : sanitizedHref.length,
    ),
    hash: hashIndex > -1 ? sanitizedHref.slice(hashIndex) : '',
    search:
      searchIndex > -1
        ? sanitizedHref.slice(
            searchIndex,
            hashIndex === -1 ? undefined : hashIndex,
          )
        : '',
    state,
  }
}

// Thanks co-pilot!
function createRandomKey() {
  return (Math.random() + 1).toString(36).slice(7)
}
