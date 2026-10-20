import type { DemoId } from './demos.ts';
import type { DemoFile } from './modules.ts';

/**
 * A demo: a small app in `samples/<sample>/src/`, run live. The kit
 * compiles its files in the browser, serves `server`'s `handler` on a
 * pretend network in the page, and starts `entry`'s `getRouter()` on a
 * memory history at `start`.
 */
export interface DemoDefinition {
  /** The file that exports `getRouter({ fetch, history })`. */
  readonly entry: string;
  /** Its files, in the editor's tab order. */
  readonly files: ReadonlyArray<DemoFile>;
  /** One sentence on what to try, above the demo. */
  readonly hint: string;
  readonly id: DemoId;
  /** The file the editor opens on. */
  readonly open: string;
  /** The file that exports the tRPC `handler`. */
  readonly server: string;
  /** The URL the app opens at. */
  readonly start: string;
}

/**
 * `sources` (an `import.meta.glob` of a sample's `src/`, as raw text) as
 * files, in `order`. Every file is listed, so a new one can't go missing
 * from the editor.
 */
export function filesOf(
  sources: Readonly<Record<string, string>>,
  order: ReadonlyArray<string>,
): ReadonlyArray<DemoFile> {
  const byName = new Map(
    Object.entries(sources).map(([path, code]) => [
      path.slice(path.lastIndexOf('/') + 1),
      code,
    ]),
  );
  const unlisted = [...byName.keys()].filter((name) => !order.includes(name));
  const missing = order.filter((name) => !byName.has(name));
  if (unlisted.length > 0 || missing.length > 0) {
    throw new Error(
      `The demo's files and its order differ: ${[...unlisted.map((name) => `${name} isn't listed`), ...missing.map((name) => `${name} doesn't exist`)].join(', ')}`,
    );
  }
  // SAFETY: every name in `order` is in `byName`, checked above.
  return order.map((name) => ({ code: byName.get(name)!, name }));
}
