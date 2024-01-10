import { httpLinkFactory } from './httpLink';
import type { GetBody, Requester } from './internals/httpUtils';
import { httpRequest } from './internals/httpUtils';

const getBody: GetBody = (opts) => {
  if (!('input' in opts)) {
    return undefined;
  }
  if (!(opts.input instanceof FormData)) {
    throw new Error('Input is not FormData');
  }
  return opts.input;
};

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
    getBody,
  });
};

export const experimental_formDataLink = httpLinkFactory({
  requester: formDataRequester,
});
