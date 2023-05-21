import { HTTPResponse, ResponseChunk } from "../../http/internals/types"
import { iteratorToResponse } from './fetchRequestHandler'

test('iterator to response', async () => {
  const iterator = (async function* () {
    yield { status: 200, headers: { 'x-hello': ['world'] } } as HTTPResponse
    yield [1, JSON.stringify({ foo: 'bar' })] as ResponseChunk
    yield [0, JSON.stringify({ q: 'a' })] as ResponseChunk
    return undefined
  })()
  const response = await iteratorToResponse(
    iterator,
    new Headers({ vary: 'yolo' }),
  )
  expect(response.status).toBe(200)
  expect(response.headers.get('x-hello')).toBe('world')
  expect(response.headers.get('vary')).toContain('yolo')
  expect(response.headers.get('vary')).toContain('x-trpc-batch-mode')
  expect(await response.text()).toMatchInlineSnapshot(`
    "{
    \\"1\\":{\\"foo\\":\\"bar\\"}
    ,\\"0\\":{\\"q\\":\\"a\\"}
    }"
  `)
})