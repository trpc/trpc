import { TRPCError } from '../error/TRPCError';
import type { RootConfig } from '../rootConfig';
import { isObject, unsetMarker } from '../utils';

type ContentTypeParser = {
  isBatchCall: boolean;
  paths: string[];
  /**
   * Get already parsed inputs - won't trigger reading the body or parsing the inputs
   */
  resultByIndex: (index: number) => unknown;
  /**
   * Get inputs by index - will trigger reading the body and parsing the inputs
   */
  parseByIndex: (index: number) => Promise<unknown>;
};
type ContentTypeHandler = {
  isMatch: (opts: Request) => boolean;
  parser: (opts: {
    path: string;
    req: Request;
    searchParams: URLSearchParams;
    config: RootConfig<any>;
  }) => ContentTypeParser;
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
    async read(): Promise<TReturn> {
      if (value !== unsetMarker) {
        return value;
      }
      if (promise === null) {
        // dedupes promises
        promise = fn();
      }

      value = await promise;
      promise = null;

      return value;
    },
    /**
     * Get an already stored result
     */
    result(): TReturn | undefined {
      return value !== unsetMarker ? value : undefined;
    },
  };
}

type InputRecord = Record<number, unknown>;

const jsonContentTypeHandler: ContentTypeHandler = {
  isMatch(req) {
    return !!req.headers.get('content-type')?.startsWith('application/json');
  },
  parser(opts) {
    const { req } = opts;
    const isBatchCall = opts.searchParams.get('batch') === '1';
    const paths = isBatchCall ? opts.path.split(',') : [opts.path];

    const getInputs = memo(async (): Promise<InputRecord> => {
      let inputs: unknown;
      if (req.method === 'GET') {
        const queryInput = opts.searchParams.get('input');
        inputs = queryInput ? JSON.parse(queryInput) : {};
      } else {
        inputs = await req.json();
      }

      if (!isBatchCall) {
        return inputs === undefined
          ? {}
          : {
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
      async parseByIndex(index: number) {
        const inputs = await getInputs.read();
        return inputs[index];
      },
      resultByIndex(index: number) {
        const inputs = getInputs.result();
        return inputs?.[index];
      },
      paths,
    };
  },
};

const formDataContentTypeHandler: ContentTypeHandler = {
  isMatch(req) {
    return !!req.headers.get('content-type')?.startsWith('multipart/form-data');
  },
  parser(opts) {
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
      paths: [opts.path],
      isBatchCall: false,
      async parseByIndex() {
        return await getInputs.read();
      },
      resultByIndex() {
        return getInputs.result();
      },
    };
  },
};

const octetStreamContentTypeHandler: ContentTypeHandler = {
  isMatch(req) {
    return !!req.headers
      .get('content-type')
      ?.startsWith('application/octet-stream');
  },
  parser(opts) {
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
      paths: [opts.path],
      isBatchCall: false,
      async parseByIndex() {
        return await getInputs.read();
      },
      resultByIndex() {
        return getInputs.result();
      },
    };
  },
};

const handlers = [
  jsonContentTypeHandler,
  formDataContentTypeHandler,
  octetStreamContentTypeHandler,
];

export function getContentTypeHandler(req: Request): ContentTypeHandler {
  const handler = handlers.find((handler) => handler.isMatch(req));
  if (handler) {
    return handler;
  }

  if (!handler && req.method === 'GET') {
    return jsonContentTypeHandler;
  }

  throw new TRPCError({
    code: 'UNSUPPORTED_MEDIA_TYPE',
    message: req.headers.has('content-type')
      ? `Unsupported content-type "${req.headers.get('content-type')}`
      : 'Missing content-type header',
  });
}
