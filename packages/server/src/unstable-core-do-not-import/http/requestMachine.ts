import type { TRPCError } from '../error/TRPCError';
import type { ProcedureType } from '../procedure';
import type {
  MachineTransition,
  StateMachine,
} from '../stateMachine/stateMachine';
import { exhaustive } from '../stateMachine/stateMachine';
import type { TRPCRequestInfoProcedureCall } from './types';

/** Where an error happened, for `onError` and the error formatter */
export interface ErrorSource {
  type: ProcedureType | 'unknown';
  call: TRPCRequestInfoProcedureCall | null;
}

/**
 * Where the request is on its way to a response. That decides what a failure
 * does: it is always reported, and answered only while nothing was sent.
 * - `receiving`: parsing it, creating its context and calling its procedures.
 * - `building`: a response builder started the response's headers.
 * - `described`: `responseMeta` ran for the response being built.
 * - `streaming`: the response was returned; only its body is still running.
 * - `done`: nothing more will be sent.
 */
export type RequestState =
  | { status: 'receiving' }
  | { status: 'building'; headers: Headers }
  | { status: 'described' }
  | { status: 'streaming' }
  | { status: 'done' };

export type RequestEvent =
  | { type: 'headersStarted'; headers: Headers }
  /** A response builder is ready for `responseMeta` */
  | { type: 'describe' }
  /** The response was returned; `streamed` if its body is still running */
  | { type: 'responded'; streamed: boolean }
  | { type: 'bodyEnded' }
  | { type: 'failed'; error: TRPCError; source: ErrorSource };

export type RequestEffect =
  | { type: 'callResponseMeta' }
  | { type: 'reportError'; error: TRPCError; source: ErrorSource }
  /**
   * Replace the response being built with an error response. `headers` is
   * the response's headers if a builder started them, and `null` for the
   * request's.
   */
  | {
      type: 'respondWithError';
      error: TRPCError;
      callResponseMeta: boolean;
      headers: Headers | null;
    };

type Step = MachineTransition<RequestState, RequestEffect>;

const done: RequestState = { status: 'done' };

function failed(
  state: RequestState,
  event: Extract<RequestEvent, { type: 'failed' }>,
): Step {
  const report: RequestEffect = {
    type: 'reportError',
    error: event.error,
    source: event.source,
  };
  switch (state.status) {
    case 'receiving':
    case 'building':
      return {
        state: done,
        effects: [
          report,
          {
            type: 'respondWithError',
            error: event.error,
            callResponseMeta: true,
            // `responseMeta` hasn't seen these yet, so they still fit
            headers: state.status === 'building' ? state.headers : null,
          },
        ],
      };
    case 'described':
      // `responseMeta` described the failed response, not this one
      return {
        state: done,
        effects: [
          report,
          {
            type: 'respondWithError',
            error: event.error,
            callResponseMeta: false,
            headers: null,
          },
        ],
      };
    case 'streaming':
    case 'done':
      // the response is out: the error can only be reported
      return { state: done, effects: [report] };
    default:
      return exhaustive(state, { state, effects: [report] });
  }
}

/**
 * Pure: says what happens next, and the effects for `resolveResponse` to
 * run. An event that doesn't fit the state is ignored.
 */
export function requestTransition(
  state: RequestState,
  event: RequestEvent,
): Step {
  const stay: Step = { state, effects: [] };
  switch (event.type) {
    case 'headersStarted':
      return state.status === 'receiving'
        ? {
            state: { status: 'building', headers: event.headers },
            effects: [],
          }
        : stay;
    case 'describe':
      return state.status === 'receiving' || state.status === 'building'
        ? {
            state: { status: 'described' },
            effects: [{ type: 'callResponseMeta' }],
          }
        : stay;
    case 'responded':
      return state.status === 'described'
        ? {
            state: event.streamed ? { status: 'streaming' } : done,
            effects: [],
          }
        : stay;
    case 'bodyEnded':
      return state.status === 'streaming' ? { state: done, effects: [] } : stay;
    case 'failed':
      return failed(state, event);
    default:
      return exhaustive(event, stay);
  }
}

export const requestMachine: StateMachine<
  RequestState,
  RequestEvent,
  RequestEffect
> = {
  initial: { state: { status: 'receiving' }, effects: [] },
  transition: requestTransition,
};
