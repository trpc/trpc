/**
 * Named HTTP status codes for the unstable HTTP modules.
 *
 * This module centralizes the mapping from literal names of the known HTTP
 * status codes, such as `"OK"` and `"Conflict"`, to their numeric codes. Use
 * {@link fromLiteral} to obtain a status code from a literal name instead of
 * remembering raw numbers.
 *
 * @stability unstable
 * @since 4.0.0
 */

const codeByLiteral = {
  Continue: 100,
  SwitchingProtocols: 101,
  Processing: 102,
  EarlyHints: 103,
  OK: 200,
  Ok: 200,
  Created: 201,
  Accepted: 202,
  NonAuthoritativeInformation: 203,
  NoContent: 204,
  ResetContent: 205,
  PartialContent: 206,
  MultiStatus: 207,
  AlreadyReported: 208,
  ImUsed: 226,
  MultipleChoices: 300,
  MovedPermanently: 301,
  Found: 302,
  SeeOther: 303,
  NotModified: 304,
  TemporaryRedirect: 307,
  PermanentRedirect: 308,
  BadRequest: 400,
  Unauthorized: 401,
  PaymentRequired: 402,
  Forbidden: 403,
  NotFound: 404,
  MethodNotAllowed: 405,
  NotAcceptable: 406,
  ProxyAuthenticationRequired: 407,
  RequestTimeout: 408,
  Conflict: 409,
  Gone: 410,
  LengthRequired: 411,
  PreconditionFailed: 412,
  PayloadTooLarge: 413,
  UriTooLong: 414,
  UnsupportedMediaType: 415,
  RangeNotSatisfiable: 416,
  ExpectationFailed: 417,
  ImATeapot: 418,
  MisdirectedRequest: 421,
  UnprocessableEntity: 422,
  Locked: 423,
  FailedDependency: 424,
  TooEarly: 425,
  UpgradeRequired: 426,
  PreconditionRequired: 428,
  TooManyRequests: 429,
  RequestHeaderFieldsTooLarge: 431,
  UnavailableForLegalReasons: 451,
  InternalServerError: 500,
  NotImplemented: 501,
  BadGateway: 502,
  ServiceUnavailable: 503,
  GatewayTimeout: 504,
  HttpVersionNotSupported: 505,
  VariantAlsoNegotiates: 506,
  InsufficientStorage: 507,
  LoopDetected: 508,
  NotExtended: 510,
  NetworkAuthenticationRequired: 511
} as const

/**
 * Union of literal names for the known HTTP status codes.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Literal = keyof typeof codeByLiteral

/**
 * Returns the numeric HTTP status code for a literal name.
 *
 * **Example** (Obtaining status codes from literal names)
 *
 * ```ts import.meta.vitest
 * import { HttpStatus } from "effect/http"
 *
 * HttpStatus.fromLiteral("OK") // => 200
 * HttpStatus.fromLiteral("Conflict") // => 409
 * ```
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const fromLiteral = <L extends Literal>(literal: L): (typeof codeByLiteral)[L] => codeByLiteral[literal]
