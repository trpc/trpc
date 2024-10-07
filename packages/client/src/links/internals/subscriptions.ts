interface ConnectionStateBase {
  type: 'state';
  data?: never;
}

export interface ConnectionIdleState extends ConnectionStateBase {
  state: 'idle';
  error?: never;
}

export interface ConnectionConnectingState<TError> extends ConnectionStateBase {
  state: 'connecting';
  error: TError | null;
}

export interface ConnectionPendingState extends ConnectionStateBase {
  state: 'pending';
  error?: never;
}

export interface ConnectionErrorState<TError> extends ConnectionStateBase {
  state: 'error';
  error: TError;
}

export type TRPCConnectionState<TError> =
  | ConnectionIdleState
  | ConnectionConnectingState<TError>
  | ConnectionPendingState
  | ConnectionErrorState<TError>;
