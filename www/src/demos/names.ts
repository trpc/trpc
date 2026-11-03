/**
 * The interactive demos a page can place with a `demo` fence, named on its
 * first line: ```` ```demo request-timeline strategy=fetch-on-render ````.
 * The words after the name are the demo's options. The fence's body, if it
 * has one, is what readers without JavaScript and the page's markdown get;
 * the demo replaces it in the browser.
 */
export const demoNames = [
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
  /** `key=value` words, which become the slot's `data-key` attributes. */
  readonly options: Readonly<Record<string, string>>;
}

export interface DemoProps {
  /** The slot's other `data-*` attributes: the fence's options. */
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
    const match = /^([a-z]+)=(\S+)$/.exec(word);
    if (!match?.[1] || !match[2]) {
      throw new Error(
        `The \`demo ${name}\` fence's option "${word}" isn't \`key=value\``,
      );
    }
    options[match[1]] = match[2];
  }
  return { name, options };
}
