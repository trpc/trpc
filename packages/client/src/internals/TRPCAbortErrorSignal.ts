export class TRPCAbortErrorSignal extends Error {
  constructor() {
    super('TRPCAbortErrorSignal');
    this.name = 'TRPCAbortErrorSignal';
    Object.setPrototypeOf(this, TRPCAbortErrorSignal.prototype);
  }
}
