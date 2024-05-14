import { TRPCError } from '../error/TRPCError';
import type { RootConfig } from '../rootConfig';
import { isObject, unsetMarker } from '../utils';
import type { TRPCRequestInfo } from './types';

type ContentTypeHandler = {
  isMatch: (opts: Request) => boolean;
  parse: (opts: {
    path: string;
    req: Request;
    searchParams: URLSearchParams;
    config: RootConfig<any>;
  }) => TRPCRequestInfo;
};

/**
 * Memoize a function that takes no arguments
 * @internal
 */
function memo<TReturn>(fn: () => Promise<TReturn>) {
  let promise: Promise<TReturn> | null = null;
  let value: TReturn | typeof unsetMarker = unsetMarker;
  return {
    /**
     * Lazily read the value
     */
    read: async (): Promise<TReturn> => {
      if (value !== unsetMarker) {
        return value;
      }
      if (promise === null) {
        // dedupes promises and catches errors
        promise = fn().catch((cause) => {
          if (cause instanceof TRPCError) {
            throw cause;
          }
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: cause instanceof Error ? cause.message : 'Invalid input',
            cause,
          });
        });
      }

      value = await promise;
      promise = null;

      return value;
    },
    /**
     * Get an already stored result
     */
    result: (): TReturn | undefined => {
      return value !== unsetMarker ? value : undefined;
    },
  };
}

const jsonContentTypeHandler: ContentTypeHandler = {
  isMatch(req) {
    return !!req.headers.get('content-type')?.startsWith('application/json');
  },
  parse(opts) {
    const { req } = opts;
    const isBatchCall = opts.searchParams.get('batch') === '1';
    const paths = isBatchCall ? opts.path.split(',') : [opts.path];

    type InputRecord = Record<number, unknown>;
    const getInputs = memo(async (): Promise<InputRecord> => {
      let inputs: unknown = undefined;
      if (req.method === 'GET') {
        const queryInput = opts.searchParams.get('input');
        if (queryInput) {
          inputs = JSON.parse(queryInput);
        }
      } else {
        inputs = await req.json();
      }
      if (inputs === undefined) {
        return {};
      }

      if (!isBatchCall) {
        return {
          0: opts.config.transformer.input.deserialize(inputs),
        };
      }

      if (!isObject(inputs)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: '"input" needs to be an object when doing a batch call',
        });
      }
      const acc: InputRecord = {};
      for (const index of paths.keys()) {
        const input = inputs[index];
        if (input !== undefined) {
          acc[index] = opts.config.transformer.input.deserialize(input);
        }
      }

      return acc;
    });

    return {
      isBatchCall,
      calls: paths.map((path, index) => ({
        path,
        getRawInput: async () => {
          const inputs = await getInputs.read();
          return inputs[index];
        },
        result: () => {
          return getInputs.result()?.[index];
        },
      })),
    };
  },
};

const formDataContentTypeHandler: ContentTypeHandler = {
  isMatch(req) {
    return !!req.headers.get('content-type')?.startsWith('multipart/form-data');
  },
  parse(opts) {
    const { req } = opts;
    if (req.method !== 'POST') {
      throw new TRPCError({
        code: 'METHOD_NOT_SUPPORTED',
        message:
          'Only POST requests are supported for multipart/form-data requests',
      });
    }
    const getInputs = memo(async () => {
      const fd = await req.formData();
      return fd;
    });
    return {
      calls: [
        {
          path: opts.path,
          getRawInput: getInputs.read,
          result: getInputs.result,
        },
      ],
      isBatchCall: false,
    };
  },
};

const octetStreamContentTypeHandler: ContentTypeHandler = {
  isMatch(req) {
    return !!req.headers
      .get('content-type')
      ?.startsWith('application/octet-stream');
  },
  parse(opts) {
    const { req } = opts;
    if (req.method !== 'POST') {
      throw new TRPCError({
        code: 'METHOD_NOT_SUPPORTED',
        message:
          'Only POST requests are supported for application/octet-stream requests',
      });
    }
    const getInputs = memo(async () => {
      return req.body;
    });
    return {
      calls: [
        {
          path: opts.path,
          getRawInput: getInputs.read,
          result: getInputs.result,
        },
      ],
      isBatchCall: false,
    };
  },
};

const handlers = [
  jsonContentTypeHandler,
  formDataContentTypeHandler,
  octetStreamContentTypeHandler,
];

function getContentTypeHandler(req: Request): ContentTypeHandler {
  const handler = handlers.find((handler) => handler.isMatch(req));
  if (handler) {
    return handler;
  }

  if (!handler && req.method === 'GET') {
    // fallback to JSON for get requests so GET-requests can be opened in browser easily
    return jsonContentTypeHandler;
  }

  throw new TRPCError({
    code: 'UNSUPPORTED_MEDIA_TYPE',
    message: req.headers.has('content-type')
      ? `Unsupported content-type "${req.headers.get('content-type')}`
      : 'Missing content-type header',
  });
}

export function getRequestInfo(opts: {
  path: string;
  req: Request;
  searchParams: URLSearchParams;
  config: RootConfig<any>;
}): TRPCRequestInfo {
  const handler = getContentTypeHandler(opts.req);
  return handler.parse(opts);
}
