/**
 * @internal
 */
export type IntersectionError<TKey extends string> =
  `The property '${TKey}' in your router collides with a built-in method, rename this router or procedure on your backend.`;

/**
 * @internal
 */
export type ProtectedIntersection<TType, TWith> = keyof TType &
  keyof TWith extends never
  ? TType & TWith
  : IntersectionError<string & keyof TType & keyof TWith>;

/**
 * @internal
 * Returns the raw input type of a procedure
 */
export type GetRawInputFn = () => Promise<unknown>;
