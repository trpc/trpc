interface ConnectionStateBase<TError> {
  type: 'state';
  data?: never;
  error: TError | null;
}

export interface ConnectionIdleState<TError>
  extends ConnectionStateBase<TError> {
  state: 'idle';
  error: null;
}

export interface ConnectionConnectingState<TError>
  extends ConnectionStateBase<TError> {
  state: 'connecting';
  error: TError | null;
}

export interface ConnectionPendingState extends ConnectionStateBase<never> {
  state: 'pending';
  error: null;
}

export type TRPCConnectionState<TError> =
  | ConnectionIdleState<TError>
  | ConnectionConnectingState<TError>
  | ConnectionPendingState;
