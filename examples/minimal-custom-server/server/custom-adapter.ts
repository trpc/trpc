import { AnyRouter } from '@trpc/server'
import {
  NodeHTTPCreateContextFnOptions,
  NodeHTTPHandlerOptions,
  nodeHTTPRequestHandler,
} from '@trpc/server/adapters/node-http'
import { AugmentedRequest, AugmentedResponse } from './custom-server'

type CreateCustomContextOptions = NodeHTTPCreateContextFnOptions<
  AugmentedRequest, AugmentedResponse
>

const createCustomHandler
  = <TRouter extends AnyRouter>(
    opts: NodeHTTPHandlerOptions<TRouter, AugmentedRequest, AugmentedResponse>) =>
  async function(req:AugmentedRequest, res:AugmentedResponse) {
    return await nodeHTTPRequestHandler({
      ...opts,
      req,
      res,
      path: req.pathname.slice(1)
    })
  }

  export {
    createCustomHandler,
    CreateCustomContextOptions
  }