/**
 * This file contains tRPC's HTTP response handler.
 */

 import { createContextTRPC } from '../../../server/context-trpc'

 import * as trpcNext from '@trpc/server/adapters/next'
import { appRouter } from '../../../server/routers/_app'
 
 // export API handler
 export default trpcNext.createNextApiHandler({
   router: appRouter,
   /**
    * @link https://trpc.io/docs/context
    */
   createContext: createContextTRPC,
   batching: { enabled: true },
   /**
    * @link https://trpc.io/docs/error-handling
    */
   onError({ error }) {
     if (error.code === 'INTERNAL_SERVER_ERROR') {
       console.error('Something went wrong', error)
     }
   },
 })
 