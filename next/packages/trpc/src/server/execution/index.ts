/**
 * Running a call: resolving the procedure, its middleware and output, the
 * response handle, declared errors, events and the durable frame sink.
 *
 * @module
 */
export { emitEvents } from './events.ts';
export type { EventFrame } from './events.ts';
export {
  callProcedure,
  createResponseHandle,
  isUnexpectedError,
  normalizeCause,
  procedureEvents,
  runtimeServices,
  unexpectedError,
} from './execute.ts';
export type { CallOpts } from './execute.ts';
export { CurrentFrameSink } from './frame-sink.ts';
export type { FrameSink } from './frame-sink.ts';
export { Response } from './response.ts';
export type { ResponseService } from './response.ts';
