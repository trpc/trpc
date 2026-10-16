import { setupServer } from 'msw/node'
import { apiHandlers } from './src/api-handlers.ts'

setupServer(...apiHandlers).listen({ onUnhandledRequest: 'bypass' })
