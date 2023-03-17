import { httpLinkFactory } from './httpLink';
import {
  GetBody,
  GetUrl,
  HTTPBaseRequestOptions,
  Requester,
  httpRequest,
} from './internals/httpUtils';
import { isObject } from './internals/isObject';

interface FormDataInput {
  formData: FormData;
  query: Record<string, unknown> | null;
}

function inputFromOpts(opts: HTTPBaseRequestOptions): FormDataInput {
  const input = 'input' in opts ? opts.input : undefined;

  if (!isObject(input)) {
    throw new Error('No input');
  }
  const { formData, ...queryParamInput } = input;

  return {
    formData: formData as FormData,
    query: Object.keys(queryParamInput).length === 0 ? null : queryParamInput,
  };
}

const getUrl: GetUrl = (opts) => {
  let url = opts.url + '/' + opts.path;
  const inputs = inputFromOpts(opts);

  if (inputs.query) {
    url +=
      '?input=' +
      encodeURIComponent(
        JSON.stringify(opts.runtime.transformer.serialize(inputs.query)),
      );
  }

  return url;
};

const getBody: GetBody = (opts) => {
  return inputFromOpts(opts).formData;
};

const formDataRequester: Requester = (opts) => {
  if (opts.type !== 'mutation') {
    // TODO(?) handle formdata queries
    throw new Error('We only handle mutations with formdata');
  }
  return httpRequest({
    ...opts,
    contentTypeHeader: 'multipart/form-data',
    getUrl,
    getBody,
  });
};

export const unstable_formDataLink = httpLinkFactory({
  requester: formDataRequester,
});
