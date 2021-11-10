
/**
 * This file contains the root router of your tRPC-backend
 */
import superjson from 'superjson';
import { createRouter } from '../createRouter';
import { animalRouter } from './animal'
import { bookRouter } from './book'
import { calendarRouter } from './calendar'
import { listRouter } from './list'
import { movieRouter } from './movie'
import { postRouter } from './post'
import { userRouter } from './user'
import { settingRouter } from './setting'
import { photoRouter } from './photo'
import { catRouter } from './cat'
import { dogRouter } from './dog'
import { horseRouter } from './horse'
import { seatRouter } from './seat'
import { flightRouter } from './flight'
import { tripRouter } from './trip'
import { contentRouter } from './content'
import { backpackRouter } from './backpack'
import { bottleRouter } from './bottle'
import { bagRouter } from './bag'
import { shoeRouter } from './shoe'
import { sweaterRouter } from './sweater'
import { partnerRouter } from './partner'
import { equipmentRouter } from './equipment'
import { thingRouter } from './thing'
import { bookcaseRouter } from './bookcase'
import { trialRouter } from './trial'

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
  .merge('animal.', animalRouter)
  .merge('book.', bookRouter)
  .merge('calendar.', calendarRouter)
  .merge('list.', listRouter)
  .merge('movie.', movieRouter)
  .merge('post.', postRouter)
  .merge('user.', userRouter)
  .merge('setting.', settingRouter)
  .merge('photo.', photoRouter)
  .merge('cat.', catRouter)
  .merge('dog.', dogRouter)
  .merge('horse.', horseRouter)
  .merge('seat.', seatRouter)
  .merge('flight.', flightRouter)
  .merge('trip.', tripRouter)
  .merge('content.', contentRouter)
  .merge('backpack.', backpackRouter)
  .merge('bottle.', bottleRouter)
  .merge('bag.', bagRouter)
  .merge('shoe.', shoeRouter)
  .merge('sweater.', sweaterRouter)
  .merge('partner.', partnerRouter)
  .merge('equipment.', equipmentRouter)
  .merge('thing.', thingRouter)
  .merge('bookcase.', bookcaseRouter)
  .merge('trial.', trialRouter);

export type AppRouter = typeof appRouter;

console.log({
  queries: Object.keys(appRouter._def.queries).length,
  mutations: Object.keys(appRouter._def.mutations).length,
  subscriptions: Object.keys(appRouter._def.subscriptions).length,
});

