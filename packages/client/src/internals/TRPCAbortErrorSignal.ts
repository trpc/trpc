export class TRPCAbortErrorSignal extends Error {
  constructor() {
    super('TRPCAbortErrorSignal');
    this.name = 'TRPCAbortErrorSignal';
    Object.setPrototypeOf(this, TRPCAbortErrorSignal.prototype);
  }
}
export class TRPCAbortError extends Error {
  constructor() {
    super('The operation was aborted.');
    this.name = 'TRPCAbortError';
    Object.setPrototypeOf(this, TRPCAbortError.prototype);
  }
}
