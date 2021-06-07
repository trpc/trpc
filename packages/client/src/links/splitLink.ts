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
  return (rt) => {
    const left = opts.left(rt);
    const right = opts.right(rt);
    return (props) => {
      opts.condition(props.op) ? left(props) : right(props);
    };
  };
}
