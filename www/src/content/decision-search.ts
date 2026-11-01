import type { DecisionWho, QuestionStatus } from './decision-types.ts';

/**
 * The decisions pages keep every choice the reader makes in the URL, so a
 * link shares it and Back undoes it. Each `validateSearch` keeps a known
 * value and drops the rest, defaults included, so a page in its default
 * state has no query and is the prerendered file; a URL with one of
 * `decisionSearchKeys` is rendered on request (`build/on-demand.ts`).
 */

const whoParams = {
  agent: 'agent',
  human: 'human',
  'human-asked': 'human asked',
} as const satisfies Record<string, DecisionWho>;

export type WhoParam = keyof typeof whoParams;

const statuses: ReadonlyArray<QuestionStatus> = ['pr', 'spike', 'open'];

/** The index's search; nothing is the whole list. */
export interface DecisionsIndexSearch {
  /** An open question's area. */
  readonly area?: string | undefined;
  /** Only the decisions with open points. */
  readonly open?: true | undefined;
  /** The filter box's words. */
  readonly q?: string | undefined;
  readonly status?: QuestionStatus | undefined;
  readonly who?: WhoParam | undefined;
}

/** An open question's search; nothing is its recommended option, alone. */
export interface OpenQuestionSearch {
  /** Its Details section, open. */
  readonly details?: true | undefined;
  /** The option shown, by its letter in lower case. */
  readonly option?: string | undefined;
  readonly view?: 'side-by-side' | undefined;
}

export const decisionSearchKeys = [
  'area',
  'details',
  'open',
  'option',
  'q',
  'status',
  'view',
  'who',
] as const satisfies ReadonlyArray<
  keyof DecisionsIndexSearch | keyof OpenQuestionSearch
>;

const isTrue = (value: unknown) => value === true || value === 'true';

const pick = <T extends string>(
  value: unknown,
  known: ReadonlyArray<T>,
): T | undefined => known.find((one) => one === value);

export function validateIndexSearch(
  search: Record<string, unknown>,
  areas: ReadonlyArray<string>,
) {
  // The router parses `?q=24` as a number.
  const q =
    typeof search['q'] === 'string' || typeof search['q'] === 'number'
      ? String(search['q']).trim()
      : '';
  const area = pick(search['area'], areas);
  const status = pick(search['status'], statuses);
  const who = pick(search['who'], Object.keys(whoParams) as Array<WhoParam>);
  const validated: DecisionsIndexSearch = {
    ...(area === undefined ? {} : { area }),
    ...(isTrue(search['open']) ? { open: true } : {}),
    ...(q === '' ? {} : { q }),
    ...(status === undefined ? {} : { status }),
    ...(who === undefined ? {} : { who }),
  };
  return validated;
}

export function validateOpenQuestionSearch(search: Record<string, unknown>) {
  const option =
    typeof search['option'] === 'string' && /^[a-z]$/i.test(search['option'])
      ? search['option'].toLowerCase()
      : undefined;
  const validated: OpenQuestionSearch = {
    ...(isTrue(search['details']) ? { details: true } : {}),
    ...(option === undefined ? {} : { option }),
    ...(search['view'] === 'side-by-side' ? { view: 'side-by-side' } : {}),
  };
  return validated;
}

export const whoOf = (param: WhoParam | undefined) =>
  param === undefined ? undefined : whoParams[param];

export const whoParamOf = (who: DecisionWho): WhoParam =>
  who === 'human asked' ? 'human-asked' : who;

/**
 * The option a question shows: the one `?option=` names, else (none, or a
 * letter it doesn't have) the recommended one.
 */
export const shownOption = (
  param: string | undefined,
  ids: ReadonlyArray<string>,
  recommended: string,
) => ids.find((id) => id.toLowerCase() === param) ?? recommended;

/** `?option=` for showing `id`: none for the recommended one. */
export const optionParam = (id: string, recommended: string) =>
  id === recommended ? undefined : id.toLowerCase();
