import { azureFuncRequestHandler } from "@trpc/server/adapters/azure-func";
import { initTRPC } from '@trpc/server';
import { z } from "zod";

const t = initTRPC.create();
const publicProcedure = t.procedure;
const router = t.router;

const appRouter = router({
    greet: publicProcedure
        .input(z.object({ name: z.string() }))
        .query(({ input, ctx }) => {
            return `Greetings, ${input.name}.`;
        }),
});

export type AppRouter = typeof appRouter;

export default azureFuncRequestHandler({
    router: appRouter
});