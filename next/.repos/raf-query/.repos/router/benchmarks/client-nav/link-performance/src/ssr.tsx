import { RouterProvider, createMemoryHistory } from '@tanstack/react-router'
import { isServer } from '@tanstack/router-core/isServer'
import { renderToString } from 'react-dom/server'
import { getSourceUrl } from '../cases'
import { assertStateUpdates, createLinkRouter } from './workload'
import type { LinkCaseId } from '../cases'

export const serverEnvironment: boolean | undefined = isServer

export async function renderScenario(
  caseId: LinkCaseId,
  stateIndex: number,
  verify = false,
) {
  const history = createMemoryHistory({
    initialEntries: [getSourceUrl(caseId, stateIndex)],
  })
  const router = createLinkRouter(caseId, history, true)
  try {
    await router.load()
    const html = renderToString(<RouterProvider router={router} />)
    if (verify) {
      assertStateUpdates(router)
    }
    return html
  } finally {
    history.destroy()
  }
}
