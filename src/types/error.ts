///////////////////////
/////  ERROR DEF  /////
///////////////////////
export const ZodRPCErrorCode = {
  InvalidEndpoint: 'InvalidEndpoint',
  InvalidMethod: 'InvalidMethod',
  InvalidPayload: 'InvalidPayload',
  InvalidPath: 'InvalidPath',
  EndpointNotFound: 'EndpointNotFound',
  NotAuthorized: 'NotAuthorized',
  AuthorizationError: 'AuthorizationError',
  NameConflict: 'NameConflict',
} as const;

export type ZodRPCErrorCode = typeof ZodRPCErrorCode[keyof typeof ZodRPCErrorCode];

export class ZodRPCError extends Error {
  code: number;
  type: ZodRPCErrorCode;

  constructor(code: number, type: ZodRPCErrorCode, message: string) {
    super(message);
    this.code = code;
    this.type = type;
  }
}
