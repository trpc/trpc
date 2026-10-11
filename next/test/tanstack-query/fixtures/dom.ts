/** Retries `assertion` until it passes or `timeout` ms pass. */
export async function waitFor<T>(
  assertion: () => T,
  { timeout = 2000 } = {},
): Promise<T> {
  const start = Date.now();
  for (;;) {
    try {
      return assertion();
    } catch (error) {
      if (Date.now() - start > timeout) throw error;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
}

/** A fresh container in `document.body`. */
export function container(): HTMLElement {
  const el = document.createElement('div');
  document.body.append(el);
  return el;
}

/** Text of the element matching `selector` inside `root`. */
export function text(root: ParentNode, selector: string): string | undefined {
  return root.querySelector(selector)?.textContent ?? undefined;
}

/** Clicks the element matching `selector` inside `root`. */
export function click(root: ParentNode, selector: string): void {
  const el = root.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`No element matches ${selector}`);
  el.click();
}
