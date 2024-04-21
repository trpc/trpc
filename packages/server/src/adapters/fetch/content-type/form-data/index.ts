import type { AnyRouter } from '../../../../@trpc/server';
import type { FetchContentTypeHandler } from '../../types';

export const getFormDataContentTypeHandler: <
  TRouter extends AnyRouter,
  TRequest extends Request,
>() => FetchContentTypeHandler<TRouter, TRequest> = () => ({
  name: 'fetch-formdata',
  isMatch(headers) {
    return !!headers.get('content-type')?.startsWith('multipart/form-data');
  },
  async getInputs(opts, inputOpts) {
    if (inputOpts.isBatchCall) {
      throw new Error('Batch calls not supported for form-data');
    }

    const form = await opts.req.formData();
    return form;
  },
});
