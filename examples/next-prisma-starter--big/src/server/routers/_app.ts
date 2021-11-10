/**
 * This file contains the root router of your tRPC-backend
 */
import superjson from 'superjson';
import { createRouter } from '../createRouter';
import { animalRouter } from './animal';
import { backpackRouter } from './backpack';
import { bagRouter } from './bag';
import { bookRouter } from './book';
import { bookcaseRouter } from './bookcase';
import { bottleRouter } from './bottle';
import { calendarRouter } from './calendar';
import { catRouter } from './cat';
import { contentRouter } from './content';
import { dogRouter } from './dog';
import { equipmentRouter } from './equipment';
import { flightRouter } from './flight';
import { horseRouter } from './horse';
import { listRouter } from './list';
import { movieRouter } from './movie';
import { partnerRouter } from './partner';
import { photoRouter } from './photo';
import { postRouter } from './post';
import { seatRouter } from './seat';
import { settingRouter } from './setting';
import { shoeRouter } from './shoe';
import { sweaterRouter } from './sweater';
import { thingRouter } from './thing';
import { trialRouter } from './trial';
import { tripRouter } from './trip';
import { userRouter } from './user';

/**
 * Create your application's root router
 * If you want to use SSG, you need export this
 * @link https://trpc.io/docs/ssg
 * @link https://trpc.io/docs/router
 */
export const appRouter = createRouter()
  /**
   * Add data transformers
   * @link https://trpc.io/docs/data-transformers
   */
  .transformer(superjson)
  /**
   * Optionally do custom error (type safe!) formatting
   * @link https://trpc.io/docs/error-formatting
   */
  // .formatError(({ shape, error }) => { })
  .merge(animalRouter)
  .merge(backpackRouter)
  .merge(bagRouter)
  .merge(bookRouter)
  .merge(bookcaseRouter)
  .merge(bottleRouter)
  .merge(calendarRouter)
  .merge(catRouter)
  .merge(contentRouter)
  .merge(dogRouter)
  .merge(equipmentRouter)
  .merge(flightRouter)
  .merge(horseRouter)
  .merge(listRouter)
  .merge(movieRouter)
  .merge(partnerRouter)
  .merge(photoRouter)
  .merge(postRouter)
  .merge(seatRouter)
  .merge(settingRouter)
  .merge(shoeRouter)
  .merge(sweaterRouter)
  .merge(thingRouter)
  .merge(trialRouter)
  .merge(tripRouter)
  .merge(userRouter);

export type AppRouter = typeof appRouter;

console.log({
  queries: Object.keys(appRouter._def.queries).length,
  mutations: Object.keys(appRouter._def.mutations).length,
  subscriptions: Object.keys(appRouter._def.subscriptions).length,
});
