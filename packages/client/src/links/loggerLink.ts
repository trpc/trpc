import { AnyRouter } from '@trpc/server';
import { observable, tap } from '@trpc/server/observable';
import { TRPCClientError } from '..';
import { Operation, OperationResultEnvelope, TRPCLink } from './types';

type ConsoleEsque = {
  log: (...args: any[]) => void;
  error: (...args: any[]) => void;
};

type EnableFnOptions<TRouter extends AnyRouter> =
  | (Operation & {
      direction: 'up';
    })
  | {
      direction: 'down';
      result: OperationResultEnvelope<unknown> | TRPCClientError<TRouter>;
    };
type EnabledFn<TRouter extends AnyRouter> = (
  opts: EnableFnOptions<TRouter>,
) => boolean;

type LoggerLinkFnOptions<TRouter extends AnyRouter> = Operation &
  (
    | {
        /**
         * Request was just initialized
         */
        direction: 'up';
      }
    | {
        /**
         * Request result
         */
        direction: 'down';
        result: OperationResultEnvelope<unknown> | TRPCClientError<TRouter>;
        elapsedMs: number;
      }
  );

type LoggerLinkFn<TRouter extends AnyRouter> = (
  opts: LoggerLinkFnOptions<TRouter>,
) => void;

const palette = {
  query: ['72e3ff', '3fb0d8'],
  mutation: ['c5a3fc', '904dfc'],
  subscription: ['ff49e1', 'd83fbe'],
};
export interface LoggerLinkOptions<TRouter extends AnyRouter> {
  logger?: LoggerLinkFn<TRouter>;
  enabled?: EnabledFn<TRouter>;
  /**
   * Used in the built-in defaultLogger
   */
  console?: ConsoleEsque;
}

// maybe this should be moved to it's own package
const defaultLogger =
  <TRouter extends AnyRouter>(
    c: ConsoleEsque = console,
  ): LoggerLinkFn<TRouter> =>
  (props) => {
    const { direction, input, type, path, context, id } = props;
    const [light, dark] = palette[type];

    const css = `
    background-color: #${direction === 'up' ? light : dark}; 
    color: ${direction === 'up' ? 'black' : 'white'};
    padding: 2px;
  `;

    const parts = [
      '%c',
      direction === 'up' ? '>>' : '<<',
      type,
      `#${id}`,
      `%c${path}%c`,
      '%O',
    ];
    const args: any[] = [
      css,
      `${css}; font-weight: bold;`,
      `${css}; font-weight: normal;`,
    ];
    if (props.direction === 'up') {
      args.push({ input, context: context });
    } else {
      args.push({
        input,
        result: props.result,
        elapsedMs: props.elapsedMs,
        context,
      });
    }
    const fn: 'error' | 'log' =
      props.direction === 'down' &&
      props.result &&
      (props.result instanceof Error || 'error' in props.result.result)
        ? 'error'
        : 'log';

    c[fn].apply(null, [parts.join(' ')].concat(args));
  };
export function loggerLink<TRouter extends AnyRouter = AnyRouter>(
  opts: LoggerLinkOptions<TRouter> = {},
): TRPCLink<TRouter> {
  const { enabled = () => true } = opts;

  const { logger = defaultLogger(opts.console) } = opts;

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
