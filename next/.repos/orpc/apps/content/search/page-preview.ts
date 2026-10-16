// The search dialog's preview pane renders `hit.content` — the index's plain
// text — so whatever a result matched on arrives stripped of the structure that
// makes it readable: a code block loses its highlighting, a table its columns, a
// callout its framing.
//
// This replaces that text with the page itself. The whole article is lifted out
// of the target page's HTML and dropped into a `.prose` wrapper, the same
// container the page renders it in, so Shiki highlighting, callouts, tables and
// images all look exactly as they do on the page — pre-rendered at build time,
// with no renderer shipped to the browser. `zoom` shrinks it to preview scale
// without changing how any of it is laid out, and the pane opens scrolled to the
// section the query matched, so a result is a small view of the real page opened
// at the relevant place rather than a clipping of it. Pages are fetched once and
// cached; the fetch doubles as a warm cache for the navigation the reader is
// about to make.
//
// It augments Blume's built-in dialog rather than forking it (747 lines that
// would then need re-merging on every upgrade). Blume rewrites the preview's
// innerHTML on each selection change, so a MutationObserver is the join point,
// and the DOM details borrowed from it — the `data-blume-search-*` hooks, the
// selected row's `bg-muted` class, the text preview being the sibling after the
// title — are all checked, never assumed: if a future version moves them, the
// pane simply keeps Blume's own text preview.

/** Blume's search dialog hooks. */
const PREVIEW = '[data-blume-search-preview]'
const RESULTS = '[data-blume-search-results]'
const INPUT = '[data-blume-search-input]'
/** Blume marks the selected row with this class (ROW_ON in its Search.astro). */
const SELECTED = 'a.bg-muted'
/** Blume's own text preview: the block it renders after the result title. */
const TEXT_PREVIEW = 'h3 + div'

/** Marks our own subtree so the observer ignores the mutations it causes. */
const OWN = 'data-orpc-page-preview'

/**
 * Wait out a burst of arrow-key selections before spending a fetch on a page
 * that isn't loaded yet. A page already in the cache skips this entirely and
 * renders in the same tick the selection changed, so moving down a result list
 * never shows the text preview flicker past on its way to the real thing.
 */
const DEBOUNCE = 120
/**
 * How far past the selection to fetch ahead. Readers move down a result list, so
 * the next few rows are the ones about to be asked for; fetching them while the
 * reader reads the current one is what makes those selections instant.
 */
const PREFETCH_AHEAD = 3
/**
 * Preview scale. Page text is sized for a full column; at ~0.85 the page still
 * reads at the pane's width while keeping every proportion it has.
 */
const ZOOM = '0.85'
/** How far back from the match a heading is taken as the section's start. */
const HEADING_LOOKBACK = 3
/** Breathing room above the section the pane opens at. */
const SCROLL_PADDING = 12
/** Pages held at once — enough for a result list, bounded for memory. */
const CACHE_LIMIT = 8
/**
 * Rendered pages held at once. Smaller than the page cache: a rendered page
 * carries the marks and is only useful while the query that made it stands.
 */
const BUILD_LIMIT = 6

/** Page furniture that is not page content, dropped before anything is scored. */
const CHROME = '[data-sponsor-slot], script, style, .twoslash-popup-container'
/** A heading opens the section a match sits in, so it is what the pane opens at. */
const HEADING = /^h[1-6]$/iu
/** Attributes that would collide with the live page's own copies. */
const IDENTIFIERS = ['id', 'for', 'name'] as const

/** Regex-special characters to escape when a query token becomes a pattern. */
const REGEXP_SPECIAL = /[$()*+.?[\\\]^{|}]/gu
/** Splits an identifier-shaped token into the words Shiki renders separately. */
const NON_WORD = /[^\p{L}\p{N}_]+/gu

/**
 * A fetched page. `article` is the promise every caller awaits; `settled` and
 * `value` are the same result made readable synchronously, because awaiting even
 * a settled promise costs a microtask and Blume paints its text preview in that
 * gap — whether a page can be rendered *now* has to be answerable without one.
 */
interface Page {
  article: Promise<Element | null>
  settled: boolean
  value: Element | null
}

/** A rendered page and where in it the pane should open. */
interface Built {
  section: HTMLElement
  /**
   * How far into the page the pane should scroll, in the pane's own pixels.
   * Resolved once while the page is fully laid out — see {@link measure} — and
   * null before that, or for a page with no match, which opens at the top.
   */
  offset: number | null
  /** Whether {@link measure} has run, which it does exactly once per page. */
  measured: boolean
}

/** Fetched pages by URL, oldest first (insertion order backs the eviction). */
const pages = new Map<string, Page>()
/** Rendered pages by page URL and query, oldest first. */
const sections = new Map<string, Built>()

/** Drop the oldest entries until `cache` is back within `limit`. */
function evict(cache: Map<string, unknown>, limit: number): void {
  while (cache.size > limit) {
    cache.delete(cache.keys().next().value!)
  }
}

/** Run off the critical path, where the browser has time to spare. */
function whenIdle(work: () => void): void {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(work)
  }
  else {
    setTimeout(work)
  }
}

/**
 * Fetch a page and keep its article, stripped of chrome. The sponsor slot goes
 * first of all: it is injected into every docs page, and an ad has no business
 * riding along into a search preview. Twoslash popups go too — their placement
 * script anchors them to the viewport against the page they came from, and
 * inside a modal dialog that puts them in the wrong place, often over the
 * results list.
 */
function loadPage(url: string): Page {
  const cached = pages.get(url)
  if (cached) {
    return cached
  }

  const page: Page = {
    article: fetch(url, { headers: { Accept: 'text/html' } })
      .then(response => (response.ok ? response.text() : ''))
      .then((html) => {
        const found = html
          ? new DOMParser().parseFromString(html, 'text/html').querySelector('article')
          : null
        if (!found) {
          return null
        }
        const owned = document.importNode(found, true)
        for (const node of owned.querySelectorAll(CHROME)) {
          node.remove()
        }
        return owned
      })
      // A failed enrichment is not worth surfacing — the pane still shows
      // Blume's text preview. Cache the miss so it isn't retried per keystroke,
      // and let a page reload be what retries it.
      .catch(() => null)
      .then((found) => {
        page.settled = true
        page.value = found
        return found
      }),
    settled: false,
    value: null,
  }

  pages.set(url, page)
  evict(pages, CACHE_LIMIT)
  return page
}

/** Escape a literal so it can be spliced into a pattern. */
function escapeToken(token: string): string {
  return token.replaceAll(REGEXP_SPECIAL, String.raw`\$&`)
}

/** Split a query into non-empty tokens. */
function tokens(query: string): string[] {
  return query.trim().split(/\s+/u).filter(Boolean)
}

/**
 * Case-insensitive alternation over `words`, or null when there are none. The
 * group is what lets `String.split` hand back the matches along with the text
 * between them, which is how the marking walks a text node in one pass.
 */
function pattern(words: string[]): RegExp | null {
  if (words.length === 0) {
    return null
  }
  return new RegExp(`(${words.map(escapeToken).join('|')})`, 'giu')
}

/**
 * Wrap matches in `<mark>` inside the page's text nodes, so the reason a
 * section was chosen is visible without reading it line by line. Text nodes are
 * collected before splitting, since splitting one appends siblings the walker
 * would otherwise revisit forever. Returns whether anything was marked.
 */
function markMatches(root: Element, words: string[]): boolean {
  const match = pattern(words)
  if (!match) {
    return false
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const texts: Text[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    texts.push(node as Text)
  }

  let marked = false
  for (const text of texts) {
    const parts = (text.textContent ?? '').split(match)
    if (parts.length < 2) {
      continue
    }
    const replacement = document.createDocumentFragment()
    for (const [index, part] of parts.entries()) {
      if (!part) {
        continue
      }
      if (index % 2 === 1) {
        const mark = document.createElement('mark')
        mark.textContent = part
        replacement.append(mark)
        marked = true
      }
      else {
        replacement.append(part)
      }
    }
    text.replaceWith(replacement)
  }
  return marked
}

/**
 * Highlight the query, falling back to its individual words.
 *
 * Shiki splits a line into one `<span>` per token, so a dotted or dashed query
 * like `os.middleware` spans three text nodes and matches none of them whole —
 * marking `os` and `middleware` separately still points the reader at the right
 * lines. Single characters are dropped from the fallback, since marking every
 * `t` in a code block is noise, not a signal.
 */
function markQuery(root: Element, words: string[]): void {
  if (markMatches(root, words)) {
    return
  }
  const parts = [
    ...new Set(words.flatMap(word => word.split(NON_WORD)).filter(part => part.length > 1)),
  ]
  if (parts.length > 0) {
    markMatches(root, parts)
  }
}

/** Distinguishes one rendered page's identifiers from the next one's. */
let renders = 0

/**
 * Namespace the identifiers the page carries in. Cloned markup sits in the
 * same document as the page it came from, and a duplicated `id` silently
 * repoints that page's own `label[for]` and anchor targets at the copy inside
 * the dialog. Prefixing keeps them unique without breaking the pairs, so a
 * preview of a tabbed block still switches tabs. In-page links go instead of
 * being rewritten: their targets are on the page behind the dialog, so
 * following one would scroll a page the reader can't see.
 */
function isolate(root: Element): void {
  renders += 1
  const prefix = `orpc-preview-${renders}-`
  for (const attribute of IDENTIFIERS) {
    for (const node of root.querySelectorAll(`[${attribute}]`)) {
      node.setAttribute(attribute, `${prefix}${node.getAttribute(attribute)}`)
    }
  }
  for (const link of root.querySelectorAll('a[href^="#"]')) {
    link.removeAttribute('href')
  }
}

/**
 * Build the page as it renders itself. `.prose` is what carries Blume's content
 * styles — including `.prose :where(pre.astro-code)`, which holds the Shiki
 * light/dark variables — so the wrapper reproduces the page's own article
 * element, and `zoom` scales the whole thing down as one piece.
 *
 * The cached article is cloned rather than moved: marking matches and
 * namespacing ids both mutate, and the cache has to stay pristine for the next
 * query to mark a different term in the same page.
 */
function buildSection(article: Element, words: string[]): HTMLElement {
  const section = document.createElement('div')
  section.setAttribute(OWN, '')
  section.className
    = 'prose max-w-none [&_mark]:rounded-sm [&_mark]:bg-accent/25 [&_mark]:text-inherit'
  section.style.zoom = ZOOM
  section.append(...[...article.children].map(block => block.cloneNode(true)))

  isolate(section)
  markQuery(section, words)
  return section
}

/**
 * The rendered page for a row, built once per page and query. Cloning a whole
 * article and marking it costs milliseconds, and a reader walking a result list
 * revisits the same rows constantly. The built node is detached when Blume
 * clears the pane and re-appended on the next visit, which is free.
 */
function sectionFor(url: string, article: Element, words: string[]): Built {
  const key = `${url}\n${words.join(' ')}`
  const cached = sections.get(key)
  if (cached) {
    return cached
  }

  const built: Built = {
    measured: false,
    offset: null,
    section: buildSection(article, words),
  }
  sections.set(key, built)
  evict(sections, BUILD_LIMIT)
  return built
}

/** The `<blume-tabs>` API used to switch panels once the element has upgraded. */
interface TabsElement extends Element {
  activate?: (index: number, sync: boolean, updateHash: boolean) => void
}

/**
 * Open the tab holding the match, if it is in one. A tabbed block shows a single
 * panel — the Cloudflare variant of a snippet, one package manager of four — and
 * a match in any other panel renders to zero height, so the page would look like
 * it doesn't contain what the reader searched for.
 *
 * An upgraded `<blume-tabs>` is asked to switch, which keeps its trigger row in
 * step (styling the panel directly would leave the tabs stuck, since a later
 * click toggles a class an inline style outranks). Where the element never
 * upgrades — the reader is on a page with no tabs of its own, so the definition
 * was never loaded — Blume's pre-hydration CSS shows the first panel and inline
 * styles are the only way past it. Switching is deliberately not synced: these
 * tabs are a preview of a page, and must not restyle the one behind the dialog.
 */
function revealTab(mark: Element): void {
  const tabs: TabsElement | null = mark.closest('blume-tabs')
  const content = tabs?.querySelector(':scope > [data-blume-tab-content]')
  if (!tabs || !content) {
    return
  }
  const panels = [...content.children]
  const index = panels.findIndex(panel => panel.contains(mark))
  if (index < 0) {
    return
  }
  if (typeof tabs.activate === 'function') {
    tabs.activate(index, false, false)
    return
  }
  for (const [position, panel] of panels.entries()) {
    ;(panel as HTMLElement).style.display = position === index ? 'block' : 'none'
  }
}

/**
 * Where the pane should open: the heading that introduces the block carrying the
 * most marks, so the reader lands on a section rather than mid-sentence. Blume
 * renders an article as a flat run of top-level blocks, so a child here is a
 * whole paragraph, code block, table or callout — the unit a reader recognizes.
 *
 * Ranking by marks rather than re-scanning the text keeps where the pane opens
 * consistent with what is actually highlighted, including where only the
 * word-by-word fallback matched. Null — no marks at all — opens the page at the
 * top, which is where a page matched on its title alone should start.
 *
 * A heading is only taken when it is close by; further back it belongs to
 * something else on the way to the match, which is then its own best anchor. And
 * when the match would sit below the fold — a long section, or a heading far
 * above its code block — the match wins and is centered instead: the reader came
 * here for it, not for the heading.
 */
function locate(preview: HTMLElement, section: HTMLElement): number | null {
  const blocks = [...section.children]
  let matched = -1
  let best = 0
  for (const [index, block] of blocks.entries()) {
    const marks = block.querySelectorAll('mark').length
    if (marks > best) {
      matched = index
      best = marks
    }
  }
  if (matched < 0) {
    return null
  }

  let start = matched
  for (let step = 1; step <= HEADING_LOOKBACK && matched - step >= 0; step += 1) {
    if (HEADING.test(blocks[matched - step]!.tagName)) {
      start = matched - step
      break
    }
  }

  const mark = blocks[matched]!.querySelector('mark')
  // Before measuring: opening a tab changes what sits above the match.
  if (mark) {
    revealTab(mark)
  }

  const top = section.getBoundingClientRect().top
  const heading = blocks[start]!.getBoundingClientRect().top - top - SCROLL_PADDING
  const match = mark ? mark.getBoundingClientRect().top - top : heading
  return match - heading > preview.clientHeight
    ? match - preview.clientHeight / 2
    : heading
}

/**
 * Settle where the page opens and let the browser skip its off-screen blocks —
 * both while it is laid out in full, which appending it just paid for, and both
 * exactly once per page.
 *
 * The order matters. `content-visibility` gives skipped blocks a placeholder
 * geometry by design, so asking one where its mark sits afterwards would scroll
 * somewhere else entirely; resolving the offset first also makes every later
 * showing of the page land in exactly the same place.
 *
 * Measuring is what makes the skipping safe. `contain-intrinsic-size` stands in
 * for skipped content, and a guessed one would put every block at the wrong
 * offset. Each block is measured after being laid out for real, so the
 * placeholder equals the height it replaces; `auto` then has the browser prefer
 * the last rendered size over the placeholder as blocks are visited.
 *
 * `offsetHeight`, not `getBoundingClientRect`: the page is zoomed, so the rect
 * is scaled while `contain-intrinsic-size` is in the block's own pixels — the
 * units `offsetHeight` reports.
 */
function measure(preview: HTMLElement, built: Built): void {
  if (built.measured) {
    return
  }
  built.measured = true
  built.offset = locate(preview, built.section)

  // Every height is read before the first style is written. Interleaving them
  // invalidates the layout that the next read then forces again — a page's worth
  // of layouts instead of one, which costs more than this saves.
  const blocks = [...built.section.children] as HTMLElement[]
  const heights = blocks.map(block => block.offsetHeight)
  for (const [index, block] of blocks.entries()) {
    const height = heights[index]!
    if (height > 0) {
      block.style.containIntrinsicSize = `auto ${height}px`
      block.style.contentVisibility = 'auto'
    }
  }
}

/**
 * Scroll the pane to the offset {@link measure} settled on. The pane is the
 * scroller — the page flows at full height inside it, the way it does in a
 * browser window — and Blume's result title sits above the page inside it, so
 * the page's own top is found rather than assumed to be the scroll origin.
 */
function openAt(preview: HTMLElement, built: Built): void {
  if (built.offset === null) {
    return
  }
  const top
    = built.section.getBoundingClientRect().top
      - preview.getBoundingClientRect().top
      + preview.scrollTop
  preview.scrollTop = top + built.offset
}

function start(
  preview: HTMLElement,
  results: HTMLElement,
  input: HTMLInputElement,
): void {
  // Every selection change supersedes the pending one: the fetch it awaits can
  // land after the reader has arrowed on, and appending then would attach a
  // stale page to a different result's preview.
  let generation = 0
  let timer: number | undefined

  const selectedRow = (): HTMLAnchorElement | null =>
    results.querySelector<HTMLAnchorElement>(SELECTED)

  /** Show a page in the pane, or leave Blume's text preview in place. */
  function render(url: string, article: Element | null, words: string[]): void {
    // Re-checked here rather than by the caller: on the awaited path Blume may
    // have rewritten the pane while the page was in flight, and a second copy
    // would stack under the first.
    if (!article || preview.querySelector(`[${OWN}]`)) {
      return
    }

    const built = sectionFor(url, article, words)
    preview.append(built.section)
    // Only now that the real thing is on screen: the text preview would
    // otherwise be the fallback vanishing before its replacement arrives.
    preview.querySelector(TEXT_PREVIEW)?.setAttribute('hidden', '')

    measure(preview, built)
    // Every showing: Blume gave the pane a fresh scroll position when it rewrote
    // it, so the page has to be scrolled back down to its section.
    openAt(preview, built)
  }

  /**
   * Warm the rows just past the selection: fetch their pages, then build them
   * while the reader is still reading the current one, so arriving costs an
   * append. `loadPage` and `sectionFor` both dedupe, so this is a no-op once a
   * result list has been walked, and repeating it per selection keeps the window
   * sliding with the reader rather than doing the whole list up front — most of
   * which is never previewed.
   *
   * Building is deferred to idle time. It is the expensive half, and nothing is
   * waiting on it: a row reached before its build finishes just builds on
   * arrival, exactly as it did before.
   */
  function prefetch(selected: HTMLAnchorElement, words: string[]): void {
    const rows = [...results.querySelectorAll<HTMLAnchorElement>('a')]
    const from = rows.indexOf(selected) + 1
    for (const row of rows.slice(from, from + PREFETCH_AHEAD)) {
      const url = row.href
      void loadPage(url).article.then((article) => {
        if (article) {
          whenIdle(() => sectionFor(url, article, words))
        }
      })
    }
  }

  function enrich(): void {
    generation += 1
    const current = generation

    // Blume keeps writing the pane while it is hidden — below `md`, and
    // whenever the reader has toggled the preview off with ⌘J. Neither case
    // should spend a page fetch on markup nobody will see.
    if (preview.offsetParent === null) {
      return
    }

    const selected = selectedRow()
    const words = tokens(input.value)
    if (!selected || words.length === 0) {
      return
    }
    prefetch(selected, words)

    const url = selected.href
    const page = loadPage(url)
    // Already loaded: render in this tick, so the page is on screen in the same
    // frame Blume wrote its text preview and the reader never sees the
    // placeholder it replaces.
    if (page.settled) {
      render(url, page.value, words)
      return
    }
    void page.article.then((article) => {
      if (current === generation) {
        render(url, article, words)
      }
    })
  }

  const observer = new MutationObserver((records) => {
    // Ignore our own append, which is itself a childList mutation here.
    const ours = records.every(record =>
      [...record.addedNodes].every(
        node => node instanceof Element && node.hasAttribute(OWN),
      ),
    )
    if (ours) {
      return
    }
    generation += 1
    window.clearTimeout(timer)
    // A loaded page is rendered straight away; only a fetch is worth waiting to
    // see whether the reader settles on this row first.
    const selected = selectedRow()
    if (selected && pages.get(selected.href)?.settled) {
      enrich()
    }
    else {
      timer = window.setTimeout(enrich, DEBOUNCE)
    }
  })

  observer.observe(preview, { childList: true })
}

const preview = document.querySelector<HTMLElement>(PREVIEW)
const results = document.querySelector<HTMLElement>(RESULTS)
const input = document.querySelector<HTMLInputElement>(INPUT)

if (preview && results && input) {
  start(preview, results, input)
}
