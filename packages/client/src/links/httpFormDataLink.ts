import { httpLinkFactory } from './httpLink';
import { httpRequest, Requester } from './internals/httpUtils';

const formDataRequester: Requester = (opts) => {
  if (opts.type !== 'mutation') {
    // TODO(?) handle formdata queries
    throw new Error('We only handle mutations with formdata');
  }
  return httpRequest({
    ...opts,
    getUrl() {
      return `${opts.url}/${opts.path}`;
    },
    getBody(opts) {
      if (!('input' in opts)) {
        return undefined;
      }
      if (!(opts.input instanceof FormData)) {
        throw new Error('Input is not FormData');
      }
      return opts.input;
    },
  });
};

export const experimental_formDataLink = httpLinkFactory({
  requester: formDataRequester,
});
