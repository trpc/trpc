import { Effect } from "effect"

export const getGc = async (): Promise<() => void> => {
  const { setFlagsFromString } = await import("node:v8")
  const { runInNewContext } = await import("node:vm")
  setFlagsFromString("--expose_gc")
  const collect = runInNewContext("gc") as () => void
  setFlagsFromString("--no-expose_gc")
  return collect
}

export const collectGarbage = Effect.promise(async () => {
  const collect = await getGc()
  // WeakRef targets remain alive until the current job ends, so collect across jobs.
  for (let i = 0; i < 8; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    collect()
  }
})
