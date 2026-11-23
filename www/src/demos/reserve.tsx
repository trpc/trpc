import type { ReactNode } from 'react';

import { cn } from '@shared/ui/lib/utils';

/**
 * `children` in a box as tall as the tallest of `shapes`, which render
 * hidden behind them, so the page below doesn't move as `children` change.
 */
export function Reserve(props: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly shapes: ReadonlyArray<ReactNode>;
}) {
  return (
    <div className={cn('grid *:col-start-1 *:row-start-1', props.className)}>
      {props.shapes.map((shape, index) => (
        <div aria-hidden className="invisible" key={index}>
          {shape}
        </div>
      ))}
      <div className="self-start">{props.children}</div>
    </div>
  );
}
