export class InputValidationError<TError extends Error> extends Error {
  public readonly originalError: TError;

  constructor(originalError: TError) {
    super(originalError.message);
    this.originalError = originalError;

    Object.setPrototypeOf(this, InputValidationError.prototype);
  }
}

export class RouteNotFoundError extends Error {
  constructor(message: string) {
    super(message);

    Object.setPrototypeOf(this, RouteNotFoundError.prototype);
  }
}
