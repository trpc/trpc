/**
 * The UTC day a page names its social card for (`dailyVersion` in
 * `og/version.ts`): the day the server renders it on, and in the browser
 * that same day, which the router hydrates (`hydrateCardDay`), so the
 * page's head hydrates unchanged however old its HTML is.
 */
import { utcDay } from './og/version.ts';

export interface DehydratedCardDay {
  readonly cardDay: string;
}

let hydrated: string | undefined;

export const cardDay = () => hydrated ?? utcDay(new Date());

/** For `dehydrate`, on the server. */
export const dehydrateCardDay = (): DehydratedCardDay => ({
  cardDay: cardDay(),
});

/** For `hydrate`, in the browser, before the router renders any head. */
export function hydrateCardDay(dehydrated: DehydratedCardDay) {
  hydrated = dehydrated.cardDay;
}
