interface ConnectionStateBase {
  type: 'state';
  data?: never;
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
  | ConnectingState<TError>
  | PendingState
  | ErrorState<TError>;
