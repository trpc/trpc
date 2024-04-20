import type { AnyRouter } from '../../../../@trpc/server';
import type { FetchHTTPContentTypeHandler } from '../../types';

export const getFormDataContentTypeHandler: <
  TRouter extends AnyRouter,
  TRequest extends Request,
>() => FetchHTTPContentTypeHandler<TRouter, TRequest> = () => ({
  name: 'fetch-formdata',
  isMatch(opts) {
    return (
      opts.req.headers.get('content-type')?.startsWith('multipart/form-data') ??
      false
    );
  },
  async getInputs(opts, inputOpts) {
    if (inputOpts.isBatchCall) {
      throw new Error('Batch calls not supported for form-data');
    }

    const form = await opts.req.formData();
    return form;
  },
});
