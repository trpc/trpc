interface ConnectionStateBase<TError> {
  type: 'state';
  data?: never;
  error: TError | null;
}

interface ConnectionIdleState extends ConnectionStateBase<null> {
  state: 'idle';
}

interface ConnectionConnectingState<TError>
  extends ConnectionStateBase<TError | null> {
  state: 'connecting';
}

interface ConnectionPendingState extends ConnectionStateBase<null> {
  state: 'pending';
}

export type TRPCConnectionState<TError> =
  | ConnectionIdleState
  | ConnectionConnectingState<TError>
  | ConnectionPendingState;
