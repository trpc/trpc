import { HTTPErrorResponseEnvelope, UnknownRouter } from '@trpc/server';
import { TRPCClientError } from '../createTRPCClient';
import { Operation, TRPCLink } from './core';

type ConsoleEsque = {
  log: (...args: any[]) => void;
  error: (...args: any[]) => void;
};

type EnableFnOptions = Operation & {
  event: 'init' | 'success' | 'error';
};
type EnabledFn = (opts: EnableFnOptions) => boolean;

type LogFnOptions<TRouter extends UnknownRouter> = Operation & {
  /**
   * Incremental id for requests
   */
  requestId: number;
} & (
    | {
        /**
         * Request was just initialized
         */
        event: 'init';
      }
    | {
        event: 'success';
        data?: unknown;
        elapsedMs: number;
      }
    | {
        event: 'error';
        error: TRPCClientError<TRouter> | HTTPErrorResponseEnvelope<TRouter>;
        elapsedMs: number;
      }
  );
type LogFn<TRouter extends UnknownRouter = UnknownRouter> = (
  opts: LogFnOptions<TRouter>,
) => void;

const palette = {
  query: ['72e3ff', '3fb0d8'],
  mutation: ['c5a3fc', '904dfc'],
  subscription: ['ff49e1', 'd83fbe'],
};
const emojiMap = {
  init: '⏳',
  success: '✅',
  error: '❌',
};
type LoggerLinkOptions<TRouter extends UnknownRouter> = {
  log?: LogFn<TRouter>;
  enabled?: EnabledFn;
  /**
   * Used in the built-in defaultLogger
   */
  console?: ConsoleEsque;
};
export function loggerLink<TRouter extends UnknownRouter = UnknownRouter>(
  opts: LoggerLinkOptions<TRouter> = {},
): TRPCLink {
  const { console: c = console, enabled = () => true } = opts;

  const defaultLogger: LogFn<TRouter> = (props) => {
    const { event, requestId, input, type, path } = props;
    const [light, dark] = palette[type];

    const css = `
      background-color: #${event === 'init' ? light : dark}; 
      color: ${event === 'init' ? 'black' : 'white'};
      padding: 2px;
    `;

    const parts = [
      '%c',
      emojiMap[event],
      event === 'init' ? '>>' : '<<',
      type,
      `#${requestId}`,
      `%c${path}%c`,
      '%O',
    ];
    const args: any[] = [
      css,
      `${css}; font-weight: bold;`,
      `${css}; font-weight: normal;`,
    ];
    if (props.event === 'error') {
      args.push({
        input,
        error: props.error,
        elapsedMs: props.elapsedMs,
      });
    } else if (props.event === 'success') {
      args.push({
        input,
        output: props.data,
        elapsedMs: props.elapsedMs,
      });
    } else if (props.event === 'init') {
      args.push({ input });
    }
    const fn: 'error' | 'log' =
      props.event === 'success' || props.event === 'init' ? 'log' : 'error';
    c[fn].apply(null, [parts.join(' ')].concat(args));
  };
  const { log: logger = defaultLogger } = opts;
  return () => {
    let requestId = 0;
    return ({ op, next, prev }) => {
      // ->
      requestId++;
      enabled({ ...op, event: 'init' }) &&
        logger({
          ...op,
          event: 'init',
          requestId,
        });
      const requestStartTime = Date.now();
      next(op, (result) => {
        const elapsedMs = Date.now() - requestStartTime;
        if (result instanceof Error || !result.ok) {
          enabled({ ...op, event: 'error' }) &&
            logger({
              ...op,
              event: 'error',
              requestId,
              elapsedMs,
              error: result,
            });
        } else {
          enabled({ ...op, event: 'success' }) &&
            logger({
              ...op,
              event: 'success',
              requestId,
              elapsedMs,
            });
        }
        // <-
        prev(result);
      });
    };
  };
}
