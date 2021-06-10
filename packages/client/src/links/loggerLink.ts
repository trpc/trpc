import { HTTPErrorResponseEnvelope, UnknownRouter } from '@trpc/server';
import { TRPCClientError } from '../createTRPCClient';
import { Operation, TRPCLink } from './core';

type ConsoleEsque = {
  log: (...args: any[]) => void;
  error: (...args: any[]) => void;
};

type EnabledCondition = (opts: {
  op: Operation;
  event: 'init' | 'success' | 'error';
}) => boolean;
type LoggerOptions<TRouter extends UnknownRouter = UnknownRouter> =
  Operation & {
    /**
     * Incremental id for requests
     */
    requestId: number;
    enabled: EnabledCondition;
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
  opts: Omit<LoggerOptions<TRouter>, 'enabled'>,
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
export function loggerLink<TRouter extends UnknownRouter = UnknownRouter>(
  opts: {
    logger?: LogFn<TRouter>;
    enabled?: (opts: LoggerOptions<TRouter>) => boolean;
    console?: ConsoleEsque;
  } = {},
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
  const { logger = defaultLogger } = opts;
  return () => {
    let requestId = 0;
    return ({ op, next, prev }) => {
      // ->
      requestId++;
      log({
        enabled,
        op,
        event: 'init',
        requestId,
      });
      const requestStartTime = Date.now();
      next(op, (result) => {
        const elapsedMs = Date.now() - requestStartTime;

        if (result instanceof Error || !result.ok) {
          logger({
            enabled,
            event: 'error',
            requestId,
            elapsedMs,
            error: result,
          });
        } else {
          log({
            enabled,
            op,
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
