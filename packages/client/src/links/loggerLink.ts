/// <reference lib="dom.iterable" />

// `dom.iterable` types are explicitly required for extracting `FormData` values,
// as all implementations of `Symbol.iterable` are separated from the main `dom` types.
// Using triple-slash directive makes sure that it will be available,
// even if end-user `tsconfig.json` omits it in the `lib` array.

import { AnyRouter } from '@trpc/server';
import { observable, tap } from '@trpc/server/observable';
import { TRPCClientError } from '..';
import { Operation, OperationResultEnvelope, TRPCLink } from './types';

type ConsoleEsque = {
  log: (...args: any[]) => void;
  error: (...args: any[]) => void;
};

type EnableFnOptions<TRouter extends AnyRouter> =
  | {
      direction: 'down';
      result: OperationResultEnvelope<unknown> | TRPCClientError<TRouter>;
    }
  | (Operation & {
      direction: 'up';
    });
type EnabledFn<TRouter extends AnyRouter> = (
  opts: EnableFnOptions<TRouter>,
) => boolean;

type LoggerLinkFnOptions<TRouter extends AnyRouter> = Operation &
  (
    | {
        /**
         * Request result
         */
        direction: 'down';
        result: OperationResultEnvelope<unknown> | TRPCClientError<TRouter>;
        elapsedMs: number;
      }
    | {
        /**
         * Request was just initialized
         */
        direction: 'up';
      }
  );

type LoggerLinkFn<TRouter extends AnyRouter> = (
  opts: LoggerLinkFnOptions<TRouter>,
) => void;

export interface LoggerLinkOptions<TRouter extends AnyRouter> {
  logger?: LoggerLinkFn<TRouter>;
  enabled?: EnabledFn<TRouter>;
  /**
   * Used in the built-in defaultLogger
   */
  console?: ConsoleEsque;
  /**
   * Color mode
   * @default typeof window === 'undefined' ? 'ansi' : 'css'
   */
  colorMode?: 'ansi' | 'css';
}

function isFormData(value: unknown): value is FormData {
  if (typeof FormData === 'undefined') {
    // FormData is not supported
    return false;
  }
  return value instanceof FormData;
}

const palettes = {
  css: {
    query: ['72e3ff', '3fb0d8'],
    mutation: ['c5a3fc', '904dfc'],
    subscription: ['ff49e1', 'd83fbe'],
  },
  ansi: {
    regular: {
      // Cyan background, black and white text respectively
      query: ['\x1b[30;46m', '\x1b[97;46m'],
      // Magenta background, black and white text respectively
      mutation: ['\x1b[30;45m', '\x1b[97;45m'],
      // Green background, black and white text respectively
      subscription: ['\x1b[30;42m', '\x1b[97;42m'],
    },
    bold: {
      query: ['\x1b[1;30;46m', '\x1b[1;97;46m'],
      mutation: ['\x1b[1;30;45m', '\x1b[1;97;45m'],
      subscription: ['\x1b[1;30;42m', '\x1b[1;97;42m'],
    },
  },
} as const;

function constructPartsAndArgs(
  opts: LoggerLinkFnOptions<any> & {
    colorMode: 'ansi' | 'css';
  },
) {
  const { direction, type, path, id, input } = opts;

  const parts: string[] = [];
  const args: any[] = [];

  if (opts.colorMode === 'ansi') {
    const [lightRegular, darkRegular] = palettes.ansi.regular[type];
    const [lightBold, darkBold] = palettes.ansi.bold[type];
    const reset = '\x1b[0m';

    parts.push(
      direction === 'up' ? lightRegular : darkRegular,
      direction === 'up' ? '>>' : '<<',
      type,
      direction === 'up' ? lightBold : darkBold,
      `#${id}`,
      path,
      reset,
    );

    if (direction === 'up') {
      args.push({ input: opts.input });
    } else {
      args.push({
        input: opts.input,
        // strip context from result cause it's too noisy in terminal wihtout collapse mode
        result: 'result' in opts.result ? opts.result.result : opts.result,
        elapsedMs: opts.elapsedMs,
      });
    }

    return { parts, args };
  }

  const [light, dark] = palettes.css[type];
  const css = `
    background-color: #${direction === 'up' ? light : dark}; 
    color: ${direction === 'up' ? 'black' : 'white'};
    padding: 2px;
  `;

  parts.push(
    '%c',
    direction === 'up' ? '>>' : '<<',
    type,
    `#${id}`,
    `%c${path}%c`,
    '%O',
  );
  args.push(css, `${css}; font-weight: bold;`, `${css}; font-weight: normal;`);

  if (direction === 'up') {
    args.push({ input, context: opts.context });
  } else {
    args.push({
      input,
      result: opts.result,
      elapsedMs: opts.elapsedMs,
      context: opts.context,
    });
  }

  return { parts, args };
}

// maybe this should be moved to it's own package
const defaultLogger =
  <TRouter extends AnyRouter>({
    c = console,
    colorMode = 'css',
  }: {
    c?: ConsoleEsque;
    colorMode?: 'ansi' | 'css';
  }): LoggerLinkFn<TRouter> =>
  (props) => {
    const rawInput = props.input;
    const input = isFormData(rawInput)
      ? Object.fromEntries(rawInput)
      : rawInput;

    const { parts, args } = constructPartsAndArgs({
      ...props,
      colorMode,
      input,
    });

    const fn: 'error' | 'log' =
      props.direction === 'down' &&
      props.result &&
      (props.result instanceof Error || 'error' in props.result.result)
        ? 'error'
        : 'log';

    c[fn].apply(null, [parts.join(' ')].concat(args));
  };

/**
 * @see https://trpc.io/docs/client/links/loggerLink
 */
export function loggerLink<TRouter extends AnyRouter = AnyRouter>(
  opts: LoggerLinkOptions<TRouter> = {},
): TRPCLink<TRouter> {
  const { enabled = () => true } = opts;

  const colorMode =
    opts.colorMode ?? (typeof window === 'undefined' ? 'ansi' : 'css');
  const { logger = defaultLogger({ c: opts.console, colorMode }) } = opts;

  return () => {
    return ({ op, next }) => {
      return observable((observer) => {
        // ->
        enabled({ ...op, direction: 'up' }) &&
          logger({
            ...op,
            direction: 'up',
          });
        const requestStartTime = Date.now();
        function logResult(
          result: OperationResultEnvelope<unknown> | TRPCClientError<TRouter>,
        ) {
          const elapsedMs = Date.now() - requestStartTime;

          enabled({ ...op, direction: 'down', result }) &&
            logger({
              ...op,
              direction: 'down',
              elapsedMs,
              result,
            });
        }
        return next(op)
          .pipe(
            tap({
              next(result) {
                logResult(result);
              },
              error(result) {
                logResult(result);
              },
            }),
          )
          .subscribe(observer);
      });
    };
  };
}
