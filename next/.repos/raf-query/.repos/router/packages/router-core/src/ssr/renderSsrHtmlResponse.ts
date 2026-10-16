import { getSsrStatus } from './handlerCallback'
import { transformHtmlStringWithRouter } from './transformStreamWithRouter'
import type { AnyRouter } from '../router'

export async function renderSsrHtmlResponse({
  router,
  responseHeaders,
  render,
}: {
  router: AnyRouter
  responseHeaders: Headers
  render: () => string | Promise<string>
}) {
  try {
    const html = await transformHtmlStringWithRouter(router, await render())
    return new Response(html, {
      status: getSsrStatus(router),
      headers: responseHeaders,
    })
  } catch (error) {
    console.error('Render to string error:', error)
    return new Response('Internal Server Error', {
      status: 500,
      headers: responseHeaders,
    })
  } finally {
    router.serverSsr?.cleanup()
  }
}
