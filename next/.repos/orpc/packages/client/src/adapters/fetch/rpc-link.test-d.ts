import { RPCLink } from './rpc-link'

describe('RPCLink', () => {
  it('accepts QUERY only for body-bearing request methods', () => {
    void new RPCLink({ method: 'QUERY' })
    void new RPCLink({ method: 'GET', fallbackMethod: 'QUERY' })

    // @ts-expect-error - HEAD is not a supported direct RPC request method
    void new RPCLink({ method: 'HEAD' })
    // @ts-expect-error - OPTIONS is not a supported direct RPC request method
    void new RPCLink({ method: 'OPTIONS' })
    // @ts-expect-error - GET cannot be used as a body-bearing fallback
    void new RPCLink({ fallbackMethod: 'GET' })
  })
})
