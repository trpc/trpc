import type { router01 } from '@monotest/router01'
import type { createTRPCReact } from '@trpc/react-query'
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'

import { trpcReact } from './trpc'

type Router01Router = typeof router01

/**
 * These are only relevant on the root "trpc."-object
 **/
type IgnoredTypes =
  | 'Provider'
  | 'createClient'
  | 'useDehydratedState'
  | 'useContext'
  | 'useUtils'

/**
 * Alex could fix these inside tRPC if we want to use them.
 **/
type TODO_TYPES = 'useQueries' | 'useSuspenseQueries'

type Router01Types = ReturnType<typeof createTRPCReact<Router01Router>>

type Router01Api = Omit<Router01Types, IgnoredTypes | TODO_TYPES>

// biome-ignore lint/suspicious/noExplicitAny: generated
export const router01Api = (trpcReact as any).router01 as Router01Api

export type Router01Inputs = inferRouterInputs<Router01Router>
export type Router01Outputs = inferRouterOutputs<Router01Router>

export const useRouter01Utils = (): Omit<
  ReturnType<Router01Types['useUtils']>,
  'client'
> => {
  // biome-ignore lint/suspicious/noExplicitAny: generated
  return (trpcReact as any).useUtils().router01
}
