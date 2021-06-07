import { HttpLinkOptions, httpRequest, TRPCLink } from './core';

export function httpLink(opts: HttpLinkOptions): TRPCLink {
  const { url } = opts;

  // initialized config
  return (runtime) => {
    // initialized in app
    return ({ op, prev, onDestroy }) => {
      const { path, input, type } = op;
      const { promise, cancel } = httpRequest({
        runtime,
        type,
        input,
        url,
        path,
      });
      onDestroy(() => cancel());
      promise.then(prev).catch(prev);
    };
  };
}
