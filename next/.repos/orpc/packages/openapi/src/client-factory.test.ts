import type { ClientContext, ClientLink } from '@orpc/client'
import { createContractClientFactory } from '@orpc/contract'
import { createContractJsonifiedClientFactory } from './client-factory'

vi.mock('@orpc/contract', () => ({
  createContractClientFactory: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createContractJsonifiedClientFactory', () => {
  const mockedLink: ClientLink<ClientContext> = {
    call: vi.fn(),
  }

  it('delegates to createContractClientFactory and returns its result', () => {
    const delegatedFactory = vi.fn()
    const options = { interceptors: [vi.fn()], routerRef: {}, options: {} }

    vi.mocked(createContractClientFactory).mockReturnValue(delegatedFactory as any)

    const result = createContractJsonifiedClientFactory(mockedLink, options as any)

    expect(createContractClientFactory).toHaveBeenCalledTimes(1)
    expect(createContractClientFactory).toHaveBeenCalledWith(mockedLink, options)
    expect(result).toBe(delegatedFactory)
  })
})
