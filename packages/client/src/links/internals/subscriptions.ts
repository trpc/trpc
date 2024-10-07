interface ConnectionStateBase {
  type: 'state';
  data?: never;
}

export interface IdleState extends ConnectionStateBase {
  state: 'idle';
  error?: never;
}

interface ConnectingState<TError> extends ConnectionStateBase {
  state: 'connecting';
  error: TError | null;
}

interface PendingState extends ConnectionStateBase {
  state: 'pending';
  error?: never;
}

interface ErrorState<TError> extends ConnectionStateBase {
  state: 'error';
  error: TError;
}

export type TRPCConnectionState<TError> =
  | IdleState
  | ConnectingState<TError>
  | PendingState
  | ErrorState<TError>;
