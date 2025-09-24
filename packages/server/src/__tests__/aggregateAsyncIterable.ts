export async function aggregateAsyncIterable<TYield, TReturn>(
  iterable: AsyncIterable<TYield, TReturn>,
) {
  const items: TYield[] = [];

  try {
    const iterator = iterable[Symbol.asyncIterator]();

    while (true) {
      const res = await iterator.next();
      if (res.done) {
        return {
          items,
          ok: true as const,
          return: res.value,
        };
      }
      items.push(res.value);
    }
  } catch (error: unknown) {
    return {
      error,
      items,
      ok: false as const,
    };
  }
}
