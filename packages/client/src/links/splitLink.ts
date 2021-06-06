import { AppLink, Operation } from './core';

export function splitLink(opts: {
  /**
   * The link to execute next if the test function returns `true`.
   */
  left: AppLink;
  /**
   * The link to execute next if the test function returns `false`.
   */
  right: AppLink;
  condition: (op: Operation) => boolean;
}): AppLink {
  return () => {
    const left = opts.left();
    const right = opts.right();
    return (meta) => {
      opts.condition(meta.op) ? left(meta) : right(meta);
    };
  };
}
