import { httpLinkFactory } from './httpLink';
import {
  GetBody,
  GetUrl,
  HTTPBaseRequestOptions,
  Requester,
  httpRequest,
} from './internals/httpUtils';
import { isObject } from './internals/isObject';

function inputFromOpts(opts: HTTPBaseRequestOptions): FormData {
  const input = 'input' in opts ? opts.input : undefined;

  if (!isObject(input)) {
    throw new Error('No input');
  }
  if (!(input instanceof FormData)) {
    throw new Error('Input is not FormData');
  }

  return input;
}

const getUrl: GetUrl = (opts) => {
  const url = opts.url + '/' + opts.path;

  return url;
};

const getBody: GetBody = (opts) => {
  return inputFromOpts(opts);
};

const formDataRequester: Requester = (opts) => {
  if (opts.type !== 'mutation') {
    // TODO(?) handle formdata queries
    throw new Error('We only handle mutations with formdata');
  }
  return httpRequest({
    ...opts,
    getUrl,
    getBody,
  });
};

export const experimental_formDataLink = httpLinkFactory({
  requester: formDataRequester,
});
