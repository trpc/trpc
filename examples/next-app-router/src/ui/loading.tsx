import { cn } from '~/lib/cn';
import type { ComponentProps } from 'react';

export function LoadingDots(props: ComponentProps<'svg'>) {
  return (
    <svg
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
      className={cn('h-6 w-6 fill-current', props.className)}
    >
      <title>loading</title>
      <circle cx="4" cy="12" r="3">
        <animate
          id="a"
          begin="0;b.end-0.25s"
          attributeName="r"
          dur="0.75s"
          values="3;.2;3"
        />
      </circle>
      <circle cx="12" cy="12" r="3">
        <animate
          begin="a.end-0.6s"
          attributeName="r"
          dur="0.75s"
          values="3;.2;3"
        />
      </circle>
      <circle cx="20" cy="12" r="3">
        <animate
          id="b"
          begin="a.end-0.45s"
          attributeName="r"
          dur="0.75s"
          values="3;.2;3"
        />
      </circle>
    </svg>
  );
}
