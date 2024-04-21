import type { TransformCallback } from 'node:stream';
import { Transform } from 'node:stream';

class SliceStream extends Transform {
  private indexOffset = 0;
  private emitUp = false;
  private emitDown = false;

  constructor(private startIndex = 0, private endIndex = Infinity) {
    super();
  }

  override _transform(
    chunk: any,
    _: BufferEncoding,
    done: TransformCallback,
  ): void {
    this.indexOffset += chunk.length;

    if (!this.emitUp && this.indexOffset >= this.startIndex) {
      this.emitUp = true;
      const start = chunk.length - (this.indexOffset - this.startIndex);

      if (this.indexOffset > this.endIndex) {
        const end = chunk.length - (this.indexOffset - this.endIndex);
        this.emitDown = true;
        this.push(chunk.slice(start, end));
      } else {
        this.push(chunk.slice(start, chunk.length));
      }

      done();
      return;
    }

    if (this.emitUp && !this.emitDown) {
      if (this.indexOffset >= this.endIndex) {
        this.emitDown = true;
        this.push(
          chunk.slice(0, chunk.length - (this.indexOffset - this.endIndex)),
        );
      } else {
        this.push(chunk);
      }

      done();
      return;
    }

    done();
  }
}

export function streamSlice(startIndex = 0, endIndex = Infinity): SliceStream {
  return new SliceStream(startIndex, endIndex);
}
