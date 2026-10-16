export function isAbortError(error: unknown): error is Error {
  return error instanceof Error && error.name.includes('Abort')
}
