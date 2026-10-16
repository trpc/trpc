/** @internal */
export type OpfsWorkerMessage =
  | [id: number, sql: string, params: ReadonlyArray<unknown>]
  | ["import", id: number, data: Uint8Array]
  | ["export", id: number]
  | ["update_hook"]
  | ["close"]
