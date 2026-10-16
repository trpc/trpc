// Vite, Rsbuild, srvx, serve, and the custom E2E servers print their bound
// address only after listening. Playwright exports named captures to workers.
export const appServerReadyPattern =
  /(?:Local:|Listening on|Accepting connections at|E2E app:)[^\n]*?https?:\/\/(?:localhost|127\.0\.0\.1|\[::\]):(?<E2E_APP_PORT>\d+)/

export const appServerReady = {
  stdout: appServerReadyPattern,
  stderr: appServerReadyPattern,
}
