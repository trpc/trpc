import { TRPCLink, Operation } from './core';

export function splitLink(opts: {
  /**
   * The link to execute next if the test function returns `true`.
   */
  left: TRPCLink;
  /**
   * The link to execute next if the test function returns `false`.
   */
  right: TRPCLink;
  condition: (op: Operation) => boolean;
}): TRPCLink {
  return () => {
    const left = opts.left();
    const right = opts.right();
    return (meta) => {
      opts.condition(meta.op) ? left(meta) : right(meta);
    };
  };
}
