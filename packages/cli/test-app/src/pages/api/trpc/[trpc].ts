import { createNextApiHandler } from '@trpc/server/adapters/next';
import { appRouter } from "~/server/routers/_app";
import { createContext } from "~/server/context";

// export API handler
export default createNextApiHandler({
  router: appRouter,
  createContext,
});