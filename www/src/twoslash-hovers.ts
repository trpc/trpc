/**
 * Twoslash's hover popups, opened and closed here instead of by CSS
 * `:hover`, so a reader can use them:
 *
 * - A popup opens after a short pause on a name, so sweeping the pointer
 *   across a block doesn't flash a popup for every name it crosses. While
 *   one is open, the next name's opens sooner.
 * - It stays open while the pointer moves into it, so a long type can be
 *   scrolled, selected and copied, and closes a moment after the pointer
 *   leaves both the name and the popup.
 * - Clicking or tapping a name pins its popup until Escape, a click
 *   elsewhere, or another click on the name. Taps are how touch screens
 *   open popups at all.
 *
 * The open name has `data-open` (and `data-pinned` when pinned). The root
 * has `data-twoslash-hovers` while this runs, which turns off the CSS
 * `:hover` popups the prerendered page uses before it hydrates.
 */

/** How long the pointer rests on a name before its popup opens. */
export const openDelay = 150;
/** The same, while another name's popup is open. */
export const switchDelay = 80;
/** How long a popup stays open after the pointer leaves it and its name. */
export const closeDelay = 250;

const hoverSelector = '.twoslash-hover:not(.twoslash-query-persisted)';

function isElement(target: EventTarget | null): target is Element {
  return target !== null && 'closest' in target;
}

function isNode(target: EventTarget | null): target is Node {
  return target !== null && 'nodeType' in target;
}

function popupOf(hover: Element) {
  return hover.querySelector<HTMLElement>(':scope > .twoslash-popup-container');
}

/**
 * Places a popup next to its name: below it, or above it when there's more
 * room there, between the sticky header and the bottom of the screen. The
 * popup is `position: fixed`, so the code block's scrolling doesn't clip
 * it, and a type taller than the room scrolls inside it.
 */
export function placePopup(hover: Element) {
  const popup = popupOf(hover);
  if (!popup) {
    return;
  }
  const anchor = hover.getBoundingClientRect();
  const margin = 8;
  // Small enough that the pointer crosses no other name on its way in.
  const gap = 2;
  const header = document.querySelector('[data-site-header]');
  const top = Math.max(0, header?.getBoundingClientRect().bottom ?? 0) + margin;
  // A pinned popup stays open while its name scrolls away.
  popup.style.visibility =
    anchor.bottom > top && anchor.top < window.innerHeight ? '' : 'hidden';
  // Measuring clears the max height, which scrolls the popup to its top.
  const scrollTop = popup.scrollTop;
  popup.style.maxHeight = '';
  const height = popup.offsetHeight;
  const roomBelow = window.innerHeight - margin - (anchor.bottom + gap);
  const roomAbove = anchor.top - gap - top;
  const below = height <= roomBelow || roomBelow >= roomAbove;
  const room = Math.max(0, below ? roomBelow : roomAbove);
  popup.style.maxHeight = `${room}px`;
  popup.style.left = `${Math.max(margin, Math.min(anchor.left, window.innerWidth - popup.offsetWidth - margin))}px`;
  popup.style.top = `${
    below ? anchor.bottom + gap : anchor.top - gap - Math.min(height, room)
  }px`;
  popup.scrollTop = scrollTop;
}

/** Runs the popups of the Twoslash blocks under `root` until the returned cleanup. */
export function installTwoslashHovers(root: HTMLElement) {
  let open: Element | null = null;
  let pending: Element | null = null;
  let openTimer: ReturnType<typeof setTimeout> | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;

  const cancelOpen = () => {
    clearTimeout(openTimer);
    pending = null;
  };
  const cancelClose = () => {
    clearTimeout(closeTimer);
  };

  const close = () => {
    cancelClose();
    open?.removeAttribute('data-open');
    open?.removeAttribute('data-pinned');
    open = null;
  };
  const show = (hover: Element, pinned: boolean) => {
    cancelOpen();
    cancelClose();
    if (open !== hover) {
      close();
      open = hover;
      hover.setAttribute('data-open', '');
    }
    hover.toggleAttribute('data-pinned', pinned);
    placePopup(hover);
  };

  const hoverAt = (target: EventTarget | null) => {
    const hover = isElement(target) ? target.closest(hoverSelector) : null;
    return hover && root.contains(hover) ? hover : null;
  };

  const onPointerOver = (event: PointerEvent) => {
    // A tap also fires pointer events; taps open popups by clicking.
    if (event.pointerType === 'touch') {
      return;
    }
    const hover = hoverAt(event.target);
    if (hover === open) {
      // Back on the open name, or inside its popup.
      cancelOpen();
      cancelClose();
      return;
    }
    if (!hover) {
      return;
    }
    if (hover !== pending) {
      cancelOpen();
      pending = hover;
      openTimer = setTimeout(
        () => {
          show(hover, false);
        },
        open ? switchDelay : openDelay,
      );
    }
  };

  const onPointerOut = (event: PointerEvent) => {
    if (event.pointerType === 'touch') {
      return;
    }
    const left = hoverAt(event.target);
    const entered = hoverAt(event.relatedTarget);
    if (left === entered) {
      return;
    }
    if (left === pending) {
      cancelOpen();
    }
    if (left === open && open && !open.hasAttribute('data-pinned')) {
      cancelClose();
      closeTimer = setTimeout(close, closeDelay);
    }
  };

  const onClick = (event: MouseEvent) => {
    if (!isElement(event.target)) {
      return;
    }
    // A click in a popup selects its text, or follows a link in its docs.
    if (event.target.closest('.twoslash-popup-container')) {
      return;
    }
    const hover = hoverAt(event.target);
    // Selecting code by dragging ends in a click too.
    if (hover && window.getSelection()?.isCollapsed !== false) {
      if (hover === open && open.hasAttribute('data-pinned')) {
        close();
      } else {
        show(hover, true);
      }
      return;
    }
    if (!hover) {
      close();
    }
  };

  const onDocumentClick = (event: MouseEvent) => {
    if (!root.contains(isNode(event.target) ? event.target : null)) {
      close();
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && open) {
      cancelOpen();
      close();
    }
  };

  // Keeps the open popup beside its name while the page or a block scrolls.
  // Not when the popup itself scrolls: placing it clears its max height to
  // measure it, which would scroll a long type back to its top.
  const follow = (event: Event) => {
    const popup = open ? popupOf(open) : null;
    if (popup && isNode(event.target) && popup.contains(event.target)) {
      return;
    }
    if (open) {
      placePopup(open);
    }
  };

  root.setAttribute('data-twoslash-hovers', '');
  root.addEventListener('pointerover', onPointerOver);
  root.addEventListener('pointerout', onPointerOut);
  root.addEventListener('click', onClick);
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('scroll', follow, { capture: true, passive: true });
  window.addEventListener('resize', follow, { passive: true });
  return () => {
    cancelOpen();
    close();
    root.removeAttribute('data-twoslash-hovers');
    root.removeEventListener('pointerover', onPointerOver);
    root.removeEventListener('pointerout', onPointerOut);
    root.removeEventListener('click', onClick);
    document.removeEventListener('click', onDocumentClick);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('scroll', follow, { capture: true });
    window.removeEventListener('resize', follow);
  };
}
