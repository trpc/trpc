import type { DevEnvironment } from 'vite'

export async function ensureLatestClientBuild(environment: DevEnvironment) {
  // Vite has no public API for awaiting bundled client output in custom SSR
  // (vitejs/vite#22991). Bracket access allows using its private engine here.
  await environment.bundledDev!['devEngine'].ensureLatestBuildOutput()
}
