///////////////////////
/////  ERROR DEF  /////
///////////////////////
export enum TRPCErrorCode {
  InvalidEndpoint = 'InvalidEndpoint',
  InvalidMethod = 'InvalidMethod',
  InvalidArguments = 'InvalidArguments',
  InvalidReturnType = 'InvalidReturnType',
  InvalidPath = 'InvalidPath',
  EndpointNotFound = 'EndpointNotFound',
  NotAuthorized = 'NotAuthorized',
  AuthorizationError = 'AuthorizationError',
  NameConflict = 'NameConflict',
  UnknownError = 'UnknownError',
}

// export type TRPCErrorCode = typeof TRPCErrorCode[keyof typeof TRPCErrorCode];

export class TRPCError extends Error {
  code: number;
  type: TRPCErrorCode;

  constructor(code: number, type: TRPCErrorCode, message: string) {
    super(message);
    this.code = code;
    this.type = type;
  }
}
