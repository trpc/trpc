let tmp_idx = 0;

/**
 * https://stackoverflow.com/a/44905352
 */
export class Deferred<T> implements Promise<T> {
  public readonly [Symbol.toStringTag] = 'Promise' as const;
  private _resolveSelf!: (value: T | PromiseLike<T>) => void;
  private _rejectSelf!: (reason?: unknown) => void;
  private promise: Promise<T>;
  public readonly id;

  public constructor() {
    this.id = tmp_idx++;
    this.promise = new Promise<T>((resolve, reject) => {
      this._resolveSelf = resolve;
      this._rejectSelf = reject;
    });
  }

  public finally(onfinally?: (() => void) | null | undefined): Promise<T> {
    return this.promise.finally(onfinally);
  }
  public then<TResult1 = T, TResult2 = never>(
    onfulfilled?:
      | ((value: T) => TResult1 | PromiseLike<TResult1>)
      | undefined
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | undefined
      | null,
  ): Promise<TResult1 | TResult2> {
    return this.promise.then(onfulfilled, onrejected);
  }

  public catch<TResult = never>(
    onrejected?:
      | ((reason: unknown) => TResult | PromiseLike<TResult>)
      | undefined
      | null,
  ): Promise<T | TResult> {
    return this.promise.catch(onrejected);
  }

  public resolve(val: T) {
    this._resolveSelf(val);
  }
  public reject(reason: unknown) {
    this._rejectSelf(reason);
  }
}
