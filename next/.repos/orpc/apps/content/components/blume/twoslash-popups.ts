// Twoslash popups need three behaviors CSS :hover can't provide alone:
//
// 1. Placement — theme.css makes popups fixed (so they escape the code
//    block's horizontal scroller) and readable-width; this anchors each one
//    just below its hovered or tapped token (or above it when the token
//    sits near the bottom of the screen), left-aligned with the token as
//    far as the viewport allows. The popup's own height is never measured
//    — the available space becomes its max-height and longer signatures
//    scroll internally — so late reflows of the nested code signature
//    can't push it offscreen. Fixed popups don't follow the page: with a
//    mouse the open one is re-anchored on scroll (wheel steps are small
//    and the one-frame lag reads as the popup following its token), while
//    touch scrolling dismisses it instead — composited touch scrolling
//    moves the page before scroll events reach the main thread, so JS
//    re-anchoring always trails the finger visibly. Placement is only
//    written on reveal and scroll, never proactively cleared: clearing
//    eagerly (outside tap, touch pointerout) made the still-visible popup
//    flash at its fallback position.
//
// 2. Hover bridge — the popup sits GAP px away from the token, and :hover
//    alone closes it the instant the pointer enters that gap. The popup
//    scrolls internally, so it can't span the gap itself (anything hanging
//    outside its box is clipped); instead a transparent fixed strip inside
//    the hover span covers exactly the gap band at the popup's width. As a
//    descendant of the token it keeps :hover alive while the pointer
//    crosses, at any speed — no timers. It must never reach into the
//    token's own line nor stretch wider than the popup, or it traps
//    sideways movement between neighboring tokens, holding the old popup
//    open instead of switching.
//
// 3. Tap pin — touch has no hover, and sticky :hover emulation on tap is
//    unreliable across mobile browsers. A tap pins the popup open via
//    OPEN_CLASS (mirrored to the :hover reveal in theme.css); tapping
//    anywhere else unpins it. Pins react to click, not pointerdown: a
//    scroll gesture that starts on a token fires pointerdown too, but
//    only a completed tap produces a click — so dragging across code
//    doesn't spawn popups. Mouse clicks are left alone so selecting code
//    text doesn't pin popups.
const EDGE = 8
const GAP = 6
const MIN_SPACE = 160
const OPEN_CLASS = 'twoslash-open'
const BRIDGE_CLASS = 'twoslash-bridge'
const DISMISSED_CLASS = 'twoslash-dismissed'

function popupFor(target: EventTarget | null): { hover: Element, popup: HTMLElement } | null {
  const element = target instanceof Element ? target : null
  const hover = element?.closest('.twoslash-hover')
  const popup = hover?.querySelector<HTMLElement>('.twoslash-popup-container')
  return hover && popup ? { hover, popup } : null
}

function bridgeFor(hover: Element): HTMLElement {
  let bridge = hover.querySelector<HTMLElement>(`:scope > .${BRIDGE_CLASS}`)
  if (!bridge) {
    bridge = document.createElement('span')
    bridge.className = BRIDGE_CLASS
    bridge.style.position = 'fixed'
    bridge.style.zIndex = '60'
    hover.append(bridge)
  }
  return bridge
}

let placed: { hover: Element, popup: HTMLElement } | null = null

function place(hover: Element, popup: HTMLElement): void {
  // Un-dismiss first: the dismissal rule display:nones the popup, which
  // would zero the width below.
  hover.classList.remove(DISMISSED_CLASS)

  // Width is only measurable while the popup is displayed. Reveals always
  // precede placement (pointerover implies :hover; taps pin before
  // placing), so an unmeasurable popup is a transient pre-reveal event —
  // skip it, the next event re-places.
  const width = popup.getBoundingClientRect().width
  if (!width) {
    return
  }

  const rect = hover.getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom - GAP - EDGE
  const spaceAbove = rect.top - GAP - EDGE
  const below = spaceBelow >= MIN_SPACE || spaceBelow >= spaceAbove
  const left = Math.max(Math.min(rect.left, window.innerWidth - width - EDGE), EDGE)

  popup.style.top = below ? `${rect.bottom + GAP}px` : 'auto'
  popup.style.bottom = below ? 'auto' : `${window.innerHeight - rect.top + GAP}px`
  popup.style.maxHeight = `${Math.max(below ? spaceBelow : spaceAbove, 80)}px`
  popup.style.left = `${left}px`
  popup.style.transform = 'none'
  popup.style.marginTop = '0'

  // Flush at the token's text edge, 1px into the popup, at the popup's
  // exact span — see the header on why the bounds are strict.
  const bridge = bridgeFor(hover)
  bridge.style.top = below ? `${rect.bottom}px` : `${rect.top - GAP - 1}px`
  bridge.style.left = `${left}px`
  bridge.style.width = `${width}px`
  bridge.style.height = `${GAP + 1}px`

  placed = { hover, popup }
}

function reveal(target: EventTarget | null): void {
  const found = popupFor(target)
  if (found) {
    place(found.hover, found.popup)
  }
}

let openHover: Element | null = null

function setOpen(hover: Element | null): void {
  if (openHover === hover) {
    return
  }
  openHover?.classList.remove(OPEN_CLASS)
  openHover = hover
  hover?.classList.add(OPEN_CLASS)
}

// Hover shows the popup via CSS :hover (the bridge keeps the chain alive
// on the way in); completed taps pin it via OPEN_CLASS — see the header on
// why click, not pointerdown. Pinning happens before placing so place()
// can measure the freshly displayed popup. click and scroll carry no
// pointerType, so the type of the latest pointer event stands in for it.
let lastPointerType = 'mouse'
document.addEventListener('pointerover', (event) => {
  lastPointerType = event.pointerType
  reveal(event.target)
})
document.addEventListener('pointerdown', (event) => {
  lastPointerType = event.pointerType
})
document.addEventListener('click', (event) => {
  const found = popupFor(event.target)
  if (!found) {
    setOpen(null)
  }
  else if (lastPointerType !== 'mouse') {
    setOpen(found.hover)
    reveal(event.target)
  }
})

// Follow (mouse) or dismiss (touch) the placed popup on scroll (capture
// catches every scroller, including the code block's own) — see the
// header on why touch can't follow. DISMISSED_CLASS hides the popup and
// bridge even where a sticky tap-:hover would keep the CSS reveal alive;
// the next place() lifts it. Scrolling inside the popup itself is the one
// scroller reading depends on, so it never dismisses.
document.addEventListener('scroll', (event) => {
  if (!placed) {
    return
  }
  if (event.target instanceof Node && placed.popup.contains(event.target)) {
    return
  }
  if (lastPointerType === 'mouse') {
    place(placed.hover, placed.popup)
    return
  }
  setOpen(null)
  placed.hover.classList.add(DISMISSED_CLASS)
  placed = null
}, { capture: true, passive: true })
