export const PING_SYM = Symbol('ping');

const PING_RESULT: IteratorResult<typeof PING_SYM> = {
  value: PING_SYM,
  done: false,
};

export async function* withPing<TValue>(
  iterable: AsyncIterable<TValue>,
  pingInterval: number,
): AsyncGenerator<TValue | typeof PING_SYM> {
  let timer!: ReturnType<typeof setTimeout>;
  const iterator = iterable[Symbol.asyncIterator]();
  while (true) {
    const nextPromise = iterator.next();
    const ping = new Promise<IteratorResult<typeof PING_SYM>>((resolve) => {
      timer = setTimeout(resolve.bind(null, PING_RESULT), pingInterval);
    });
    let result: IteratorResult<TValue | typeof PING_SYM>;
    try {
      result = await Promise.race([ping, nextPromise]);
    } finally {
      clearTimeout(timer);
    }
    if (result.done) {
      return result.value;
    }
    yield result.value;
  }
}
