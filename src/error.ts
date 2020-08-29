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
  data: { message: string; [k: string]: any };
  // type: TRPCErrorCode;

  constructor(
    code: number,
    // type: TRPCErrorCode,
    data: { message: string; [k: string]: any },
  ) {
    super(data.message);
    this.code = code;
    this.data = data;
    // this.type = type;
  }
}
