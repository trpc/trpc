import { useRouter } from '@tanstack/react-router';

import { cn } from '@shared/ui/lib/utils';

const tabStorageKey = (group: string) => `trpc-docs:tab:${group}`;

function isElement(target: EventTarget | null): target is Element {
  return target !== null && 'closest' in target;
}

function internalHref(target: EventTarget | null, root: HTMLElement) {
  if (!isElement(target)) {
    return undefined;
  }
  const anchor = target.closest('a');
  if (!anchor || !root.contains(anchor) || anchor.target) {
    return undefined;
  }
  const url = new URL(anchor.href, window.location.href);
  if (
    url.origin !== window.location.origin ||
    !/^\/(?:(?:v\d+\/)?docs|blog)\//.test(url.pathname) ||
    url.pathname.endsWith('.md')
  ) {
    return undefined;
  }
  if (url.pathname === window.location.pathname && url.hash) {
    return undefined;
  }
  return url.pathname + url.hash;
}

/** The code a block shows, without Twoslash's types and error messages. */
function codeText(pre: Element) {
  const copy = pre.cloneNode(true);
  if (!isElement(copy)) {
    return '';
  }
  // A pinned type or an error is a line of its own, in place of the newline
  // after the code line it belongs to.
  for (const metaLine of copy.querySelectorAll('.twoslash-meta-line')) {
    metaLine.replaceWith('\n');
  }
  for (const popup of copy.querySelectorAll('.twoslash-popup-container')) {
    popup.remove();
  }
  // The fold's label isn't part of the sample. The lines stay in the body.
  for (const toggle of copy.querySelectorAll('.code-collapse-toggle')) {
    toggle.remove();
  }
  return copy.textContent.trimEnd();
}

/**
 * Shows a Twoslash hover popup next to its name: below it, or above it when
 * there's more room there, between the sticky header and the bottom of the
 * screen. The popup is `position: fixed`, so the code block's scrolling
 * doesn't clip it, and a type taller than the room scrolls inside it.
 */
function placePopup(target: EventTarget | null) {
  const hover = isElement(target)
    ? target.closest('.twoslash-hover:not(.twoslash-query-persisted)')
    : null;
  const popup = hover?.querySelector<HTMLElement>(
    ':scope > .twoslash-popup-container',
  );
  if (!hover || !popup) {
    return;
  }
  const anchor = hover.getBoundingClientRect();
  const margin = 8;
  const gap = 6;
  const header = document.querySelector('[data-site-header]');
  const top = Math.max(0, header?.getBoundingClientRect().bottom ?? 0) + margin;
  // A tap leaves the name hovered until the next tap, so it can scroll away.
  popup.style.visibility =
    anchor.bottom > top && anchor.top < window.innerHeight ? '' : 'hidden';
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
}

/** Keeps the hovered popup beside its name while the page or a block scrolls. */
function followPopups(root: HTMLElement) {
  const follow = () => {
    const hovered = root.querySelector('.twoslash-hover:hover');
    if (hovered) {
      placePopup(hovered);
    }
  };
  document.addEventListener('scroll', follow, { capture: true, passive: true });
  window.addEventListener('resize', follow, { passive: true });
  return () => {
    document.removeEventListener('scroll', follow, { capture: true });
    window.removeEventListener('resize', follow);
  };
}

/** Opens or closes a folded code region. The lines stay in the page either way. */
function toggleCodeCollapse(target: EventTarget | null) {
  if (!isElement(target)) {
    return false;
  }
  const button = target.closest('button[data-collapse]');
  const region = button?.closest('.code-collapse');
  const body = region?.querySelector(':scope > .code-collapse-body');
  const closed = button?.querySelector('.code-collapse-when-closed');
  const open = button?.querySelector('.code-collapse-when-open');
  if (!button || !body || !closed || !open) {
    return false;
  }
  const willOpen = body.hasAttribute('hidden');
  body.toggleAttribute('hidden', !willOpen);
  closed.toggleAttribute('hidden', willOpen);
  open.toggleAttribute('hidden', !willOpen);
  button.setAttribute('aria-expanded', String(willOpen));
  return true;
}

/** Shows `tab` in every tab group named `group` under `root`. */
function selectTab(root: ParentNode, group: string, tab: string) {
  for (const tabs of root.querySelectorAll(`[data-tabs="${group}"]`)) {
    if (!tabs.querySelector(`:scope > [data-tab="${tab}"]`)) {
      continue;
    }
    for (const block of tabs.querySelectorAll(':scope > [data-tab]')) {
      block.toggleAttribute(
        'data-active',
        block.getAttribute('data-tab') === tab,
      );
    }
    for (const button of tabs.querySelectorAll('[data-tab-select]')) {
      button.setAttribute(
        'aria-selected',
        String(button.getAttribute('data-tab-select') === tab),
      );
    }
  }
}

function storedTab(group: string) {
  try {
    return localStorage.getItem(tabStorageKey(group));
  } catch {
    return null;
  }
}

/** Applies the reader's stored tab choices, like the package manager. */
function restoreTabs(root: HTMLElement) {
  const groups = new Set(
    Array.from(root.querySelectorAll('[data-tabs]'), (tabs) =>
      tabs.getAttribute('data-tabs'),
    ),
  );
  for (const group of groups) {
    const tab = group === null ? null : storedTab(group);
    if (group !== null && tab !== null) {
      selectTab(root, group, tab);
    }
  }
}

/** Switches a tab group, and every group of its kind on the page, on click. */
function clickTab(target: EventTarget | null) {
  const button = isElement(target)
    ? target.closest('button[data-tab-select]')
    : null;
  const group = button?.getAttribute('data-tab-group');
  const tab = button?.getAttribute('data-tab-select');
  if (!group || !tab) {
    return false;
  }
  selectTab(document, group, tab);
  try {
    localStorage.setItem(tabStorageKey(group), tab);
  } catch {
    // Storage is blocked: the choice lasts until the next page.
  }
  return true;
}

function copyCode(target: EventTarget | null) {
  const copy = isElement(target) ? target.closest('button[data-copy]') : null;
  if (!copy) {
    return false;
  }
  const pre = copy.parentElement?.querySelector('pre');
  const code = pre ? codeText(pre) : '';
  if (code) {
    void navigator.clipboard.writeText(code).then(() => {
      copy.textContent = 'Copied';
      setTimeout(() => {
        copy.textContent = 'Copy';
      }, 1500);
    });
  }
  return true;
}

/**
 * A page's prerendered HTML. Links between pages navigate client-side and
 * preload on hover, like the router's `<Link>`.
 */
export function DocBody(props: {
  readonly className?: string;
  readonly html: string;
}) {
  const router = useRouter();
  return (
    <div
      className={cn(
        'prose prose-neutral max-w-none dark:prose-invert',
        props.className,
      )}
      // SAFETY: build-time HTML from the repo's own markdown.
      dangerouslySetInnerHTML={{ __html: props.html }}
      key={props.html}
      onClick={(event) => {
        if (
          toggleCodeCollapse(event.target) ||
          clickTab(event.target) ||
          copyCode(event.target)
        ) {
          return;
        }
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        const href = internalHref(event.target, event.currentTarget);
        if (href) {
          event.preventDefault();
          void router.navigate({ to: href });
        }
      }}
      onPointerOver={(event) => {
        placePopup(event.target);
        const href = internalHref(event.target, event.currentTarget);
        if (href) {
          void router.preloadRoute({ to: href });
        }
      }}
      ref={(element) => {
        if (!element) {
          return undefined;
        }
        restoreTabs(element);
        return followPopups(element);
      }}
    />
  );
}
