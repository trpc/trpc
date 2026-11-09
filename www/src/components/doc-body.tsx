import { useRouter } from '@tanstack/react-router';

import { cn } from '@shared/ui/lib/utils';

import { splitAtDemos } from '~/demos/names.ts';
import { PageDemo } from '~/demos/page-demos.tsx';
import { chooseLinkedTabs, chooseTab, restoreTabs } from '~/tabs-dom.ts';
import { installTwoslashHovers, type LoadPopups } from '~/twoslash-hovers.ts';

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
  if (
    url.pathname === window.location.pathname &&
    url.search === window.location.search &&
    url.hash
  ) {
    return undefined;
  }
  return url.pathname + url.search + url.hash;
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

/**
 * Switches a tab group, and every group of its kind on the page, on click,
 * keeping the tab where it is on screen.
 */
function clickTab(target: EventTarget | null) {
  const button = isElement(target)
    ? target.closest('button[data-tab-select]')
    : null;
  const group = button?.getAttribute('data-tab-group');
  const tab = button?.getAttribute('data-tab-select');
  if (!button || !group || !tab) {
    return false;
  }
  const top = button.getBoundingClientRect().top;
  chooseTab(group, tab);
  // Groups of its kind above it can change height.
  window.scrollBy({
    behavior: 'instant',
    top: button.getBoundingClientRect().top - top,
  });
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

const prose = 'prose prose-neutral max-w-none dark:prose-invert';

/**
 * A page's prerendered HTML, with its demos (`PageDemo`) in prose blocks of
 * their own between it. Links between pages navigate client-side and preload
 * on hover, like the router's `<Link>`.
 */
export function DocBody(props: {
  readonly className?: string;
  readonly html: string;
  /** Its hover popups, which `html` leaves out. */
  readonly loadPopups: LoadPopups;
}) {
  const router = useRouter();
  return (
    <div
      className={props.className}
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
          const url = new URL(href, window.location.href);
          if (url.pathname === window.location.pathname) {
            chooseLinkedTabs(event.currentTarget, url.search);
          }
          void router.navigate({ href });
        }
      }}
      onPointerOver={(event) => {
        const href = internalHref(event.target, event.currentTarget);
        if (href) {
          // Preloading needs only the page, not its search or hash.
          void router.preloadRoute({
            to: new URL(href, window.location.href).pathname,
          });
        }
      }}
      ref={(element) => {
        if (!element) {
          return undefined;
        }
        restoreTabs(element);
        return installTwoslashHovers(element, props.loadPopups);
      }}
    >
      {splitAtDemos(props.html).map((part, index) =>
        typeof part === 'string' ? (
          <div
            className={cn(
              prose,
              // Typography drops each block's first top margin, which a
              // heading after a demo still needs.
              index > 0 && '[&>h2:first-child]:mt-[2em]',
            )}
            // SAFETY: build-time HTML from the repo's own markdown.
            dangerouslySetInnerHTML={{ __html: part }}
            key={index}
          />
        ) : (
          <div className={prose} key={index}>
            <PageDemo name={part.name} options={part.options} />
          </div>
        ),
      )}
    </div>
  );
}
