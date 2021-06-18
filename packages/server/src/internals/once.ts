export const once = <A extends any[], R, T>(
  fn: (this: T, ...arg: A) => R,
): ((this: T, ...arg: A) => R | undefined) => {
  let done = false;
  return function (this: T, ...args: A) {
    return done ? void 0 : ((done = true), fn.apply(this, args));
  };
};

export const deprecateTransformWarning = once(() => {
  console.warn(
    '⚠️ DEPRECATION WARNING: transformers usage have moved from the HTTP-handler to your router, see https://trpc.io/docs/data-transformers',
  );
});
