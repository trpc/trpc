export type IntersectPick<T, U> = Pick<T, keyof T & keyof U>

/**
 * Like `Omit`, but distributes over unions and keeps known keys beside index signatures.
 */
export type DistributiveOmit<T, K extends PropertyKey> = { [P in keyof T as P extends K ? never : P]: T[P] }

/**
 * Remove protected/private properties/methods
 */
export type Public<T> = Pick<T, keyof T>

export type PromiseWithError<T, TError> = Promise<T> & { __error?: { type: TError } }

/**
 * The place where you can config the orpc types.
 *
 * - `ThrowableError` the error type that represent throwable errors should be `Error` or `null | undefined | {}` if you want more strict.
 */
export interface Registry {

}

export type ThrowableError = Registry extends { ThrowableError: infer T } ? T : Error
