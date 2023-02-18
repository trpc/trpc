import { httpLinkFactory } from './httpLink';
import { GetBody, GetUrl, Requester, httpRequest } from './internals/httpUtils';

const getUrl: GetUrl = (opts) => {
  let url = opts.url + '/' + opts.path;

  const input = ('input' in opts ? opts.input : undefined) as
    | FormData
    | undefined;

  if (opts.type === 'query' && input !== undefined) {
    url += '?' + new URLSearchParams(input as URLSearchParams).toString();
  }

  return url;
};

const getBody: GetBody = (opts) => {
  if (opts.type === 'query') {
    return undefined;
  }
  const input = ('input' in opts ? opts.input : undefined) as
    | FormData
    | undefined;
  return input;
};

const formDataRequester: Requester = (opts) => {
  return httpRequest({
    ...opts,
    contentTypeHeader:
      opts.type === 'query' ? 'application/x-www-form-urlencoded' : undefined,
    getUrl,
    getBody,
  });
};

export const unstable_formDataLink = httpLinkFactory({
  requester: formDataRequester,
});
