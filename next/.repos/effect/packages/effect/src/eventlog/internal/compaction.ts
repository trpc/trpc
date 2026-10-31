import * as Effect from "../../Effect.ts"
import type { StoreId } from "../EventLogMessage.ts"

/** Rules and audit logs shared by the memory and SQL compaction storages. */

export const hourMillis = 60 * 60 * 1000

/** The newest storage-time hour that ended at least `lagMillis` ago. */
export const lagHour = (now: number, lagMillis: number): number => Math.floor((now - lagMillis) / hourMillis) - 1

/** A staged batch's position packs its segment index and its index in the segment. */
export const positionsPerSegment = 2 ** 20
export const maxSegments = Math.floor(Number.MAX_SAFE_INTEGER / positionsPerSegment)

const service = "EventLogServerEncrypted"

export const logCommit = (options: {
  readonly publicKey: string
  readonly storeId: StoreId
  readonly result: "Committed" | "Superseded"
  readonly through: number
  readonly keptCount: number
  readonly activationId: string | undefined
}): Effect.Effect<void> =>
  Effect.logInfo(
    options.result === "Committed" ? "Committed compaction snapshot" : "Compaction snapshot superseded"
  ).pipe(
    Effect.annotateLogs({
      service,
      publicKey: options.publicKey,
      storeId: options.storeId,
      keptCount: options.keptCount,
      through: options.through,
      activationId: options.activationId
    })
  )

export const logNoOp = (options: {
  readonly publicKey: string
  readonly storeId: StoreId
  readonly stageId: string
  readonly through: number
}): Effect.Effect<void> =>
  Effect.logInfo("Committed compaction no-op").pipe(Effect.annotateLogs({ service, ...options }))

export const logRollback = (options: {
  readonly publicKey: string
  readonly storeId: StoreId
  readonly activation: { readonly id: string; readonly base: number; readonly keptCount: number | undefined }
  readonly withdrawn: { readonly id: string; readonly base: number; readonly keptCount: number | undefined }
}): Effect.Effect<void> =>
  Effect.logInfo("Rolled back compaction snapshot").pipe(
    Effect.annotateLogs({
      service,
      publicKey: options.publicKey,
      storeId: options.storeId,
      keptCount: options.activation.keptCount,
      base: options.activation.base,
      activationId: options.activation.id,
      withdrawnActivationId: options.withdrawn.id,
      withdrawnBase: options.withdrawn.base,
      withdrawnKeptCount: options.withdrawn.keptCount
    })
  )
