import type { RPCSerializer } from '@orpc/client'
import type { BatchLinkPluginMode } from '@orpc/client/plugins'
import type { AnyRouter, Context, RouterClient } from '@orpc/server'
import type { Public } from '@orpc/shared'
import { defaultSerializer } from '../../rpc/__shared__/client-server'

export interface BatchClientServerTestOptions {
  context?: Context
  method?: 'GET' | 'POST' | 'QUERY'
  mode?: BatchLinkPluginMode
  serializer?: Public<RPCSerializer>
}

export interface BatchClientServerTest<T extends AnyRouter> {
  client: RouterClient<T>
  fetchSpy: ReturnType<typeof vi.fn<(url: string, init: RequestInit) => ReturnType<typeof fetch>>>
}

export interface CreateBatchClientServerTest {
  <T extends AnyRouter>(router: T, options?: BatchClientServerTestOptions): BatchClientServerTest<T>
}

export const defaultBatchClientServerOptions = {
  context: {},
  mode: 'streaming' as BatchLinkPluginMode,
  serializer: defaultSerializer,
}

export const defaultBatchGroup = {
  condition: () => true,
  context: {},
}
