import { Transform, TransformCallback } from 'node:stream';

class SliceStream extends Transform {
  #start: number;
  #end: number;
  #offset = 0;
  #emitUp = false;
  #emitDown = false;

  constructor(start = 0, end = Infinity) {
    super();
    this.#start = start;
    this.#end = end;
  }

  _transform(chunk: any, _: BufferEncoding, done: TransformCallback): void {
    this.#offset += chunk.length;

    if (!this.#emitUp && this.#offset >= this.#start) {
      this.#emitUp = true;
      const start = chunk.length - (this.#offset - this.#start);

      if (this.#offset > this.#end) {
        const end = chunk.length - (this.#offset - this.#end);
        this.#emitDown = true;
        this.push(chunk.slice(start, end));
      } else {
        this.push(chunk.slice(start, chunk.length));
      }

      return done();
    }

    if (this.#emitUp && !this.#emitDown) {
      if (this.#offset >= this.#end) {
        this.#emitDown = true;
        this.push(chunk.slice(0, chunk.length - (this.#offset - this.#end)));
      } else {
        this.push(chunk);
      }

      return done();
    }

    return done();
  }
}

export function streamSlice(start = 0, end = Infinity): SliceStream {
  return new SliceStream(start, end);
}
