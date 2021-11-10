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
import { random0Router } from './random0';
import { random1Router } from './random1';
import { random2Router } from './random2';
import { random3Router } from './random3';
import { random4Router } from './random4';
import { random5Router } from './random5';
import { random6Router } from './random6';
import { random7Router } from './random7';
import { random8Router } from './random8';
import { random9Router } from './random9';
import { random10Router } from './random10';
import { random11Router } from './random11';
import { random12Router } from './random12';
import { random13Router } from './random13';
import { random14Router } from './random14';
import { random15Router } from './random15';
import { random16Router } from './random16';
import { random17Router } from './random17';
import { random18Router } from './random18';
import { random19Router } from './random19';
import { random20Router } from './random20';
import { random21Router } from './random21';
import { random22Router } from './random22';
import { random23Router } from './random23';
import { random24Router } from './random24';
import { random25Router } from './random25';
import { random26Router } from './random26';
import { random27Router } from './random27';
import { random28Router } from './random28';
import { random29Router } from './random29';
import { random30Router } from './random30';
import { random31Router } from './random31';
import { random32Router } from './random32';
import { random33Router } from './random33';
import { random34Router } from './random34';
import { random35Router } from './random35';
import { random36Router } from './random36';
import { random37Router } from './random37';
import { random38Router } from './random38';
import { random39Router } from './random39';
import { random40Router } from './random40';
import { random41Router } from './random41';
import { random42Router } from './random42';
import { random43Router } from './random43';
import { random44Router } from './random44';
import { random45Router } from './random45';
import { random46Router } from './random46';
import { random47Router } from './random47';
import { random48Router } from './random48';
import { random49Router } from './random49';
import { random50Router } from './random50';

/**
 * Create your application's root router
 * If you want to use SSG, you need export this
 * @link https://trpc.io/docs/ssg
 * @link https://trpc.io/docs/router
 */
export const appRouter = (createRouter() as any)
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
  .merge(userRouter)
  .merge(random0Router)
  .merge(random1Router)
  .merge(random2Router)
  .merge(random3Router)
  .merge(random4Router)
  .merge(random5Router)
  .merge(random6Router)
  .merge(random7Router)
  .merge(random8Router)
  .merge(random9Router)
  .merge(random10Router)
  .merge(random11Router)
  .merge(random12Router)
  .merge(random13Router)
  .merge(random14Router)
  .merge(random15Router)
  .merge(random16Router)
  .merge(random17Router)
  .merge(random18Router)
  .merge(random19Router)
  .merge(random20Router)
  .merge(random21Router)
  .merge(random22Router)
  .merge(random23Router)
  .merge(random24Router)
  .merge(random25Router)
  .merge(random26Router)
  .merge(random27Router)
  .merge(random28Router)
  .merge(random29Router)
  .merge(random30Router)
  .merge(random31Router)
  .merge(random32Router)
  .merge(random33Router)
  .merge(random34Router)
  .merge(random35Router)
  .merge(random36Router)
  .merge(random37Router)
  .merge(random38Router)
  .merge(random39Router)
  .merge(random40Router)
  .merge(random41Router)
  .merge(random42Router)
  .merge(random43Router)
  .merge(random44Router)
  .merge(random45Router)
  .merge(random46Router)
  .merge(random47Router)
  .merge(random48Router)
  .merge(random49Router)
  .merge(random50Router);

export type AppRouter = typeof appRouter;

console.log({
  queries: Object.keys(appRouter._def.queries).length,
  mutations: Object.keys(appRouter._def.mutations).length,
  subscriptions: Object.keys(appRouter._def.subscriptions).length,
});
