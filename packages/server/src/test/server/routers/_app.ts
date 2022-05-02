import { trpc } from '../context';
import { mixedRouter } from './mixedRouter';
import { orgRouter } from './orgRouter';
import { postRouter } from './postRouter';

/**
 * Create the app's router based on the mixedRouter and postRouter.
 */
export const appRouter = trpc.mergeRouters(mixedRouter, postRouter, orgRouter);
