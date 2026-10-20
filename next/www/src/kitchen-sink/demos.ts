/**
 * The kitchen sink's demos, by the id a docs page embeds them with: a
 * `demo` fence holding the id. Each is a small app in `samples/<sample>/`,
 * typechecked there, run live and editable on the page, and shown in the
 * page's `sample` fences. Pure, so the build reads it too.
 */
export const demos = {
  files: {
    sample: 'kitchen-sink-files',
    title: 'Upload an avatar',
  },
  forms: {
    sample: 'kitchen-sink-forms',
    title: 'Edit a profile',
  },
  optimistic: {
    sample: 'kitchen-sink-optimistic',
    title: 'Todos, saved optimistically',
  },
} as const satisfies Record<
  string,
  { readonly sample: string; readonly title: string }
>;

export type DemoId = keyof typeof demos;

export const demoIds = Object.keys(demos) as ReadonlyArray<DemoId>;

export function isDemoId(id: string): id is DemoId {
  return Object.hasOwn(demos, id);
}
