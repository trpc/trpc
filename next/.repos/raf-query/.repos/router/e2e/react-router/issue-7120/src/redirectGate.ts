type RedirectGate = {
  waiting: boolean
  released: boolean
  release: () => void
}

declare global {
  interface Window {
    redirectGate: RedirectGate
  }
}

let releasePromise!: () => void
const promise = new Promise<void>((resolve) => {
  releasePromise = resolve
})

const redirectGate: RedirectGate = {
  waiting: false,
  released: false,
  release: () => {
    if (!redirectGate.released) {
      redirectGate.released = true
      releasePromise()
    }
  },
}

window.redirectGate = redirectGate

export async function waitForRedirectGate() {
  redirectGate.waiting = true
  await promise
  redirectGate.waiting = false
}
