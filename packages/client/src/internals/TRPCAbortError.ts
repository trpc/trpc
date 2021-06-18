export class TRPCAbortError extends Error {
  constructor() {
    super('TRPCAbortError');
    this.name = 'TRPCAbortError';
    Object.setPrototypeOf(this, TRPCAbortError.prototype);
  }
}

export class TRPCAbortErrorSignal extends Error {
  constructor() {
    super('TRPCAbortErrorSignal');
    this.name = 'TRPCAbortErrorSignal';
    Object.setPrototypeOf(this, TRPCAbortErrorSignal.prototype);
  }
}
