/**
 * Part of the public `TRPCConnectionState`.
 * @public
 */
interface ConnectionStateBase<TError> {
  type: 'state';
  data?: never;
  error: TError | null;
}

interface ConnectionIdleState extends ConnectionStateBase<null> {
  state: 'idle';
}

interface ConnectionConnectingState<
  TError,
> extends ConnectionStateBase<TError | null> {
  state: 'connecting';
}

interface ConnectionPendingState extends ConnectionStateBase<null> {
  state: 'pending';
}

/** @public */
export type TRPCConnectionState<TError> =
  | ConnectionIdleState
  | ConnectionConnectingState<TError>
  | ConnectionPendingState;
