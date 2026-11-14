/**
 * The interactive demos a page can place with a `demo` fence, named on its
 * first line: ```` ```demo request-timeline strategy=fetch-on-render ````.
 * The words after the name are the demo's options. The fence's body, if it
 * has one, is what the page's markdown gets in the demo's place.
 */
export const demoNames = [
  'dependent-queries',
  'loader-handles',
  'request-timeline',
  'starting-queries',
  'url-input',
  'waterfalls',
] as const;

export type DemoName = (typeof demoNames)[number];

export function isDemoName(name: string): name is DemoName {
  return (demoNames as ReadonlyArray<string>).includes(name);
}

export interface DemoFence {
  readonly name: DemoName;
  /** The fence's `key=value` words. */
  readonly options: Readonly<Record<string, string>>;
}

export interface DemoProps {
  /** The fence's options. */
  readonly options: Readonly<Record<string, string | undefined>>;
}

/** A `demo` fence's meta: its name and options. Throws on anything else. */
export function parseDemoFence(meta: string): DemoFence {
  const [name = '', ...words] = meta.trim().split(/\s+/);
  if (!isDemoName(name)) {
    throw new Error(
      `Unknown demo "${name}" in a \`demo\` fence; the demos are ${demoNames.join(', ')}`,
    );
  }
  const options: Record<string, string> = {};
  for (const word of words) {
    const match = /^([a-z]+)=([\w,.-]+)$/.exec(word);
    if (!match?.[1] || !match[2]) {
      throw new Error(
        `The \`demo ${name}\` fence's option "${word}" isn't \`key=value\``,
      );
    }
    options[match[1]] = match[2];
  }
  return { name, options };
}

/**
 * The comment a `demo` fence leaves in its page's HTML, where the page
 * renders the demo (`build/markdown.ts`): `<!--demo url-input-->`.
 */
export function demoMarker(demo: DemoFence) {
  const options = Object.entries(demo.options).map(
    ([key, value]) => ` ${key}=${value}`,
  );
  return `<!--demo ${demo.name}${options.join('')}-->`;
}

/** A page's HTML, in order: the HTML between its demos, and the demos. */
export function splitAtDemos(html: string): ReadonlyArray<DemoFence | string> {
  return html
    .split(/<!--demo (.*?)-->/)
    .map((part, index) => (index % 2 === 0 ? part : parseDemoFence(part)))
    .filter((part) => typeof part !== 'string' || part.trim() !== '');
}
