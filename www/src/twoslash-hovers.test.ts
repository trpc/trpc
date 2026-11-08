// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import {
  closeDelay,
  inlinePopups,
  installTwoslashHovers,
  type LoadPopups,
  openDelay,
  switchDelay,
} from './twoslash-hovers.ts';

/** Two names on a line, as Twoslash renders them, and a plain token. */
const block = `
<pre class="twoslash"><code><span class="line"><span class="twoslash-hover" id="router"><span class="twoslash-popup-container" id="router-popup"><code class="twoslash-popup-code">const router: Router</code></span>router</span><span id="plain"> = </span><span class="twoslash-hover" id="t"><span class="twoslash-popup-container"><code class="twoslash-popup-code">const t: TRPC</code></span>t</span></span></code></pre>
<p id="outside">After the block</p>
`;

let cleanup: () => void = () => {};

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = `<div id="root">${block}</div><p id="page">Page</p>`;
  cleanup = installTwoslashHovers(
    element('root'),
    inlinePopups({ popups: [] }),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function element(id: string) {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`#${id} isn't in the page`);
  }
  return found;
}

/** Moves the pointer from `from` (or nowhere) onto `to`, as a browser reports it. */
function move(from: string | null, to: string) {
  const left = from === null ? null : element(from);
  const entered = element(to);
  left?.dispatchEvent(
    new MouseEvent('pointerout', { bubbles: true, relatedTarget: entered }),
  );
  entered.dispatchEvent(
    new MouseEvent('pointerover', { bubbles: true, relatedTarget: left }),
  );
}

function openName() {
  return document.querySelector('[data-open]')?.id ?? null;
}

test('a popup opens once the pointer rests on its name', () => {
  move(null, 'router');
  vi.advanceTimersByTime(openDelay - 1);
  expect(openName()).toBe(null);
  vi.advanceTimersByTime(1);
  expect(openName()).toBe('router');
});

test('sweeping across a name opens nothing', () => {
  move(null, 'router');
  vi.advanceTimersByTime(openDelay / 2);
  move('router', 'outside');
  vi.advanceTimersByTime(openDelay * 2);
  expect(openName()).toBe(null);
});

test('a popup stays open while the pointer moves into it', () => {
  move(null, 'router');
  vi.advanceTimersByTime(openDelay);
  // Across the gap between the name and its popup, which isn't the name.
  move('router', 'plain');
  vi.advanceTimersByTime(closeDelay - 1);
  move('plain', 'router-popup');
  vi.advanceTimersByTime(closeDelay * 2);
  expect(openName()).toBe('router');
});

test('crossing another name on the way into a popup keeps the popup', () => {
  move(null, 'router');
  vi.advanceTimersByTime(openDelay);
  move('router', 't');
  vi.advanceTimersByTime(switchDelay - 1);
  move('t', 'router-popup');
  vi.advanceTimersByTime(closeDelay * 2);
  expect(openName()).toBe('router');
});

test('a popup closes a moment after the pointer leaves it', () => {
  move(null, 'router');
  vi.advanceTimersByTime(openDelay);
  move('router', 'outside');
  vi.advanceTimersByTime(closeDelay - 1);
  expect(openName()).toBe('router');
  vi.advanceTimersByTime(1);
  expect(openName()).toBe(null);
});

test('resting on another name switches to its popup sooner', () => {
  move(null, 'router');
  vi.advanceTimersByTime(openDelay);
  move('router', 't');
  vi.advanceTimersByTime(switchDelay);
  expect(openName()).toBe('t');
});

test('a click pins a popup until Escape', () => {
  element('router').click();
  expect(openName()).toBe('router');
  expect(element('router').hasAttribute('data-pinned')).toBe(true);
  move('router', 'outside');
  vi.advanceTimersByTime(closeDelay * 2);
  expect(openName()).toBe('router');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(openName()).toBe(null);
});

test('a pinned popup closes on a click elsewhere, or on its name', () => {
  element('router').click();
  element('page').click();
  expect(openName()).toBe(null);
  element('router').click();
  element('router').click();
  expect(openName()).toBe(null);
});

test('a click inside a popup keeps it open', () => {
  element('router').click();
  element('router-popup').click();
  expect(openName()).toBe('router');
});

test("scrolling inside a popup doesn't place it again", () => {
  element('router').click();
  const popup = element('router-popup');
  // Placing a popup clears its max height to measure it, which scrolls a
  // long type back to its top.
  popup.style.maxHeight = '123px';
  popup.dispatchEvent(new Event('scroll'));
  expect(popup.style.maxHeight).toBe('123px');
  document.dispatchEvent(new Event('scroll'));
  expect(popup.style.maxHeight).not.toBe('123px');
});

test('cleanup closes the popup and stops listening', () => {
  element('router').click();
  cleanup();
  expect(openName()).toBe(null);
  expect(element('root').hasAttribute('data-twoslash-hovers')).toBe(false);
  element('t').click();
  expect(openName()).toBe(null);
  cleanup = () => {};
});

/** A block whose popups' content the page loads (`data-popup`). */
function installLazyBlock(loadPopups: LoadPopups) {
  cleanup();
  document.body.innerHTML = `<div id="root"><pre class="twoslash"><code><span class="line"><span class="twoslash-hover" data-popup="1" id="lazy">lazy</span><span id="lazy-plain"> = 1</span></span></code></pre></div>`;
  cleanup = installTwoslashHovers(element('root'), loadPopups);
}

/** The lazy name's popup's content, once it has one. */
function lazyPopup() {
  return (
    element('lazy').querySelector('.twoslash-popup-container')?.innerHTML ?? ''
  );
}

const lazyPopups = [
  '<code>const other: 2</code>',
  '<code>const lazy: 1</code>',
];

test('the popups load once the pointer enters a block, before it rests on a name', async () => {
  const loadPopups = vi.fn<LoadPopups>(() => Promise.resolve(lazyPopups));
  installLazyBlock(loadPopups);
  move(null, 'lazy-plain');
  move('lazy-plain', 'lazy');
  expect(loadPopups).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(openDelay);
  expect(openName()).toBe('lazy');
  expect(lazyPopup()).toBe('<code>const lazy: 1</code>');
  expect(element('lazy').hasAttribute('data-popup')).toBe(false);
});

test('a popup that opens before the popups load is filled once they do', async () => {
  const { promise, resolve } = Promise.withResolvers<ReadonlyArray<string>>();
  installLazyBlock(() => promise);
  // A tap: no pointer events before the click.
  element('lazy').click();
  expect(openName()).toBe('lazy');
  expect(lazyPopup()).toBe('');
  resolve(lazyPopups);
  await vi.advanceTimersByTimeAsync(0);
  expect(lazyPopup()).toBe('<code>const lazy: 1</code>');
});

test('a failed load of the popups is tried again when a popup opens', async () => {
  const loadPopups = vi
    .fn<LoadPopups>()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(lazyPopups);
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  installLazyBlock(loadPopups);
  // Entering the block starts a load, which fails.
  move(null, 'lazy');
  await vi.advanceTimersByTimeAsync(0);
  expect(logged).toHaveBeenCalledWith(
    'Twoslash popups failed to load',
    new Error('offline'),
  );
  // Opening the popup tries again.
  await vi.advanceTimersByTimeAsync(openDelay);
  expect(loadPopups).toHaveBeenCalledTimes(2);
  expect(lazyPopup()).toBe('<code>const lazy: 1</code>');
  logged.mockRestore();
});

test('a tapped name whose popup fails to load closes, so the next tap tries again', async () => {
  const loadPopups = vi
    .fn<LoadPopups>()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(lazyPopups);
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
  installLazyBlock(loadPopups);
  element('lazy').click();
  await vi.advanceTimersByTimeAsync(0);
  expect(openName()).toBe(null);
  element('lazy').click();
  await vi.advanceTimersByTimeAsync(0);
  expect(openName()).toBe('lazy');
  expect(lazyPopup()).toBe('<code>const lazy: 1</code>');
  logged.mockRestore();
});
