import superjson from 'superjson';

// https://github.com/blitz-js/superjson/pull/95
export const sj = {
  deserialize: superjson.deserialize,
  serialize: (input: unknown) => {
    const data = superjson.serialize(input);
    if (!data.meta) {
      delete data.meta;
    }
    return data;
  },
};
