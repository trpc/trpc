export class TRPCAbortError extends Error {
  constructor() {
    super('The operation was aborted.');
    this.name = 'TRPCAbortError';
    Object.setPrototypeOf(this, TRPCAbortError.prototype);
  }
}
