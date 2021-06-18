export class TRPCAbortError extends Error {
  constructor() {
    super('TRPCAbortError');
    this.name = 'TRPCAbortError';
    Object.setPrototypeOf(this, TRPCAbortError.prototype);
  }
}
