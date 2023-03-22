import http from "http";
import { createHTTPHandler } from "../trpc/packages/server/dist/adapters/standalone.mjs";
import {
  defaultTransformer,
  initTRPC,
} from "../trpc/packages/server/dist/index.js";
import z from "zod";

const user = z.object({
  email: z.string(),
  name: z.string(),
});

const t = initTRPC.context().create({
  transformer: defaultTransformer,
});

export const appRouter = t.router({
  batched: t.procedure
    .input(user.partial())
    .batch()
    .mutation(({ input }) => {
      console.log(input);
      return input;
    }),
  manualBatch: t.procedure
    .input(user.partial().array())
    .mutation(({ input }) => {
      console.log(input);
      return input;
    }),
  naive: t.procedure.input(user.partial()).mutation(({ input }) => {
    console.log("save operation: ", input);
  }),
});

const trpcHandler = createHTTPHandler({
  router: appRouter,
});

export type AppRouter = typeof appRouter;

http
  .createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Request-Method", "*");
    res.setHeader("Access-Control-Allow-Methods", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      return res.end();
    }
    trpcHandler(req, res);
  })
  .listen(3200);
