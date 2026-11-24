/// <reference lib="dom.iterable" />

// `dom.iterable` types are explicitly required for extracting `FormData` values,
// as all implementations of `Symbol.iterable` are separated from the main `dom` types.
// Using triple-slash directive makes sure that it will be available,
// even if end-user `tsconfig.json` omits it in the `lib` array.

import { observable, tap } from '@trpc/server/observable';
import type {
  AnyRouter,
  InferrableClientTypes,
} from '@trpc/server/unstable-core-do-not-import';
import type { TRPCClientError } from '../TRPCClientError';
import { pipelineOf, readsOf } from './internals/pipelineContext';
import type { Operation, OperationResultEnvelope, TRPCLink } from './types';

type ConsoleEsque = {
  log: (...args: any[]) => void;
  error: (...args: any[]) => void;
};

type EnableFnOptions<TRouter extends InferrableClientTypes> =
  | {
      direction: 'down';
      result:
        | OperationResultEnvelope<unknown, TRPCClientError<TRouter>>
        | TRPCClientError<TRouter>;
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
        result:
          | OperationResultEnvelope<unknown, TRPCClientError<TRouter>>
          | TRPCClientError<TRouter>;
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

type ColorMode = 'ansi' | 'css' | 'none';

/**
 * Options for {@link loggerLink}.
 *
 * @see https://trpc.io/docs/client/links/loggerLink#loggerlink-options
 */
export interface LoggerLinkOptions<TRouter extends AnyRouter> {
  /**
   * Replaces the built-in logger. Called when a call starts and for each
   * result or error, so a subscription calls it for every event.
   */
  logger?: LoggerLinkFn<TRouter>;
  /**
   * Decides whether to log a call.
   * @default () => true
   */
  enabled?: EnabledFn<TRouter>;
  /**
   * The console the built-in logger writes to.
   */
  console?: ConsoleEsque;
  /**
   * Color mode
   * @default typeof window === 'undefined' ? 'ansi' : 'css'
   */
  colorMode?: ColorMode;

  /**
   * Include context in the log - defaults to false unless `colorMode` is 'css'
   */
  withContext?: boolean;
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
    colorMode: ColorMode;
    withContext?: boolean;
    /** The paths of the calls that went in the operation's request */
    pipelined: readonly string[];
  },
) {
  const { direction, type, withContext, id, input } = opts;
  // The calls that the server makes in the operation's request, after it
  const path =
    opts.pipelined.length > 0
      ? `${opts.path} (+ ${opts.pipelined.join(', ')})`
      : opts.path;

  const parts: string[] = [];
  const args: any[] = [];

  if (opts.colorMode === 'none') {
    parts.push(direction === 'up' ? '>>' : '<<', type, `#${id}`, path);
  } else if (opts.colorMode === 'ansi') {
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
  } else {
    // css color mode
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
    args.push(
      css,
      `${css}; font-weight: bold;`,
      `${css}; font-weight: normal;`,
    );
  }

  if (direction === 'up') {
    args.push(withContext ? { input, context: opts.context } : { input });
  } else {
    args.push({
      input,
      result: opts.result,
      elapsedMs: opts.elapsedMs,
      ...(withContext && { context: opts.context }),
    });
  }

  return { parts, args };
}

// maybe this should be moved to it's own package
const defaultLogger =
  <TRouter extends AnyRouter>({
    c = console,
    colorMode = 'css',
    withContext,
  }: {
    c?: ConsoleEsque;
    colorMode?: ColorMode;
    withContext?: boolean;
  }) =>
  (props: LoggerLinkFnOptions<TRouter>, pipelined: readonly string[]) => {
    const rawInput = props.input;
    const input = isFormData(rawInput)
      ? Object.fromEntries(rawInput)
      : rawInput;

    const { parts, args } = constructPartsAndArgs({
      ...props,
      colorMode,
      input,
      withContext,
      pipelined,
    });

    const fn: 'error' | 'log' =
      props.direction === 'down' &&
      props.result &&
      (props.result instanceof Error ||
        ('error' in props.result.result && props.result.result.error))
        ? 'error'
        : 'log';

    c[fn].apply(null, [parts.join(' ')].concat(args));
  };

/**
 * Logs each call when it starts, and each result or error it gets with the
 * time since the start.
 *
 * @see https://trpc.io/docs/client/links/loggerLink
 */
export function loggerLink<TRouter extends AnyRouter = AnyRouter>(
  opts: LoggerLinkOptions<TRouter> = {},
): TRPCLink<TRouter> {
  const { enabled = () => true } = opts;

  const colorMode =
    opts.colorMode ?? (typeof window === 'undefined' ? 'ansi' : 'css');
  const withContext = opts.withContext ?? colorMode === 'css';
  const builtIn = defaultLogger<TRouter>({
    c: opts.console,
    colorMode,
    withContext,
  });
  /** A logger of the options gets what it always got */
  const logger = (
    props: LoggerLinkFnOptions<TRouter>,
    pipelined: readonly string[],
  ) => (opts.logger ? opts.logger(props) : builtIn(props, pipelined));

  return () => {
    return ({ op, next }) => {
      return observable((observer) => {
        /**
         * Calls that a link that pipelines adds to the operation's request.
         * They are known when the request goes, not as the operation starts
         */
        const pipeline = pipelineOf(op);
        let pipelined: readonly string[] = [];
        let loggedUp = false;
        // ->
        function logUp() {
          if (loggedUp) {
            return;
          }
          loggedUp = true;
          if (enabled({ ...op, direction: 'up' })) {
            logger({ ...op, direction: 'up' }, pipelined);
          }
        }
        if (!pipeline) {
          logUp();
        }
        const requestStartTime = Date.now();
        function logResult(
          result:
            | OperationResultEnvelope<unknown, TRPCClientError<TRouter>>
            | TRPCClientError<TRouter>,
        ) {
          // Before its result, whatever happened to its request
          logUp();
          const elapsedMs = Date.now() - requestStartTime;

          // The input as the server filled it in, if it read other queries
          const filled = readsOf(op)?.filled;
          if (enabled({ ...op, direction: 'down', result })) {
            logger(
              {
                ...op,
                ...(filled ? { input: filled.input } : {}),
                direction: 'down',
                elapsedMs,
                result,
              },
              pipelined,
            );
          }
        }
        const subscription = next(op)
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
        if (pipeline) {
          // A link that pipelines opens the pipeline as it takes the
          // operation, which it does as the operation is subscribed to
          if (pipeline.open) {
            void pipeline.sent.then((paths) => {
              pipelined = paths;
              logUp();
            });
          } else {
            logUp();
          }
        }
        return subscription;
      });
    };
  };
}
