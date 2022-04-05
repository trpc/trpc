/**
 * Cells are a declarative approach to data fetching, inspired by https://redwoodjs.com/docs/cells
 */
import {
  QueryObserverIdleResult,
  QueryObserverLoadingErrorResult,
  QueryObserverLoadingResult,
  QueryObserverRefetchErrorResult,
  QueryObserverSuccessResult,
  UseQueryResult,
} from 'react-query';

type JSXElementOrNull = JSX.Element | null;

type ErrorResult<TData, TError> =
  | QueryObserverLoadingErrorResult<TData, TError>
  | QueryObserverRefetchErrorResult<TData, TError>;

interface CreateQueryCellOptions<TError> {
  /**
   * Default error handler for this cell
   */
  error: (query: ErrorResult<unknown, TError>) => JSXElementOrNull;
  /**
   * Default loading handler for this cell
   */
  loading: (
    query: QueryObserverLoadingResult<unknown, TError>,
  ) => JSXElementOrNull;
  /**
   * Default idle handler for this cell (when `enabled: false`)
   */
  idle: (query: QueryObserverIdleResult<unknown, TError>) => JSXElementOrNull;
}

interface QueryCellOptions<TData, TError> {
  query: UseQueryResult<TData, TError>;
  /**
   * Optionally override default error handling
   */
  error?: (query: ErrorResult<TData, TError>) => JSXElementOrNull;
  /**
   * Optionally override loading state
   */
  loading?: (
    query: QueryObserverLoadingResult<TData, TError>,
  ) => JSXElementOrNull;
  /**
   * Override `enabled: false`-state - defaults to same as `loading`
   */
  idle?: (query: QueryObserverIdleResult<TData, TError>) => JSXElementOrNull;
}

interface QueryCellOptionsWithEmpty<TData, TError>
  extends QueryCellOptions<TData, TError> {
  /**
   * Render callback for when the data is fetched successfully
   */
  success: (
    query: QueryObserverSuccessResult<NonNullable<TData>, TError>,
  ) => JSXElementOrNull;
  /**
   * Render callback for when the data is empty - when the `data` is `null`-ish or an empty array
   */
  empty: (query: QueryObserverSuccessResult<TData, TError>) => JSXElementOrNull;
}
interface QueryCellOptionsNoEmpty<TData, TError>
  extends QueryCellOptions<TData, TError> {
  success: (
    query: QueryObserverSuccessResult<TData, TError>,
  ) => JSXElementOrNull;
}

export function createQueryCell<TError>(
  queryCellOpts: CreateQueryCellOptions<TError>,
) {
  function QueryCell<TData>(
    opts: QueryCellOptionsWithEmpty<TData, TError>,
  ): JSXElementOrNull;
  function QueryCell<TData>(
    opts: QueryCellOptionsNoEmpty<TData, TError>,
  ): JSXElementOrNull;
  function QueryCell<TData>(
    opts:
      | QueryCellOptionsNoEmpty<TData, TError>
      | QueryCellOptionsWithEmpty<TData, TError>,
  ) {
    const { query } = opts;

    if (query.status === 'success') {
      if (
        'empty' in opts &&
        (query.data == null ||
          (Array.isArray(query.data) && query.data.length === 0))
      ) {
        return opts.empty(query);
      }
      return opts.success(
        query as QueryObserverSuccessResult<NonNullable<TData>, TError>,
      );
    }

    if (query.status === 'error') {
      return opts.error?.(query) ?? queryCellOpts.error(query);
    }
    if (query.status === 'loading') {
      return opts.loading?.(query) ?? queryCellOpts.loading(query);
    }
    if (query.status === 'idle') {
      return opts.idle?.(query) ?? queryCellOpts.idle(query);
    }
    // impossible state
    return null;
  }
  return QueryCell;
}
