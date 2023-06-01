let tmp_idx = 0;

/**
 * https://stackoverflow.com/a/44905352
 */
export class Deferred<TType> implements Promise<TType> {
  public readonly [Symbol.toStringTag] = 'Promise' as const;
  private _resolveSelf!: (value: TType | PromiseLike<TType>) => void;
  private _rejectSelf!: (reason?: unknown) => void;
  private promise: Promise<TType>;
  public readonly id;
  public __id = 0;

  public constructor() {
    this.id = tmp_idx++;
    this.promise = new Promise<TType>((resolve, reject) => {
      this._resolveSelf = resolve;
      this._rejectSelf = reject;
    });
  }

  public finally(onfinally?: (() => void) | null | undefined): Promise<TType> {
    return this.promise.finally(onfinally);
  }
  public then<TResult1 = TType, TResult2 = never>(
    onfulfilled?:
      | ((value: TType) => TResult1 | PromiseLike<TResult1>)
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
  ): Promise<TType | TResult> {
    return this.promise.catch(onrejected);
  }

  public resolve(val: TType) {
    this._resolveSelf(val);
  }
  public reject(reason: unknown) {
    this._rejectSelf(reason);
  }
}
