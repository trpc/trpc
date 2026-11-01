import { useId } from 'react';

import { cn } from '@shared/ui/lib/utils';

/** The mark's side, in `viewBox` units. */
const tile = 84.998;
/** The wordmark's width, mark included, in `viewBox` units. */
const wordmarkWidth = 314.364;

/**
 * The edges between the cubes, each fading toward its first end, so the mark
 * reads as turning.
 */
const connectors: ReadonlyArray<{
  readonly d: string;
  readonly fade: number;
  readonly from: readonly [number, number];
  readonly to: readonly [number, number];
}> = [
  {
    d: 'M54.134 25.642 65.77 32.36v13.435',
    fade: 0.1,
    from: [54.134, 25.642],
    to: [65.77, 32.36],
  },
  {
    d: 'm54.134 65.947-11.635 6.718-11.635-6.718',
    fade: 0.1,
    from: [54.134, 65.947],
    to: [42.499, 72.665],
  },
  {
    d: 'M19.229 45.795V32.36l11.635-6.718',
    fade: 0.35,
    from: [19.229, 45.795],
    to: [19.229, 32.36],
  },
];

const cubes =
  'M72.057 46.872a3.28 3.28 0 0 1 1.64 2.84v12.235a3.28 3.28 0 0 1-1.64 2.839l-10.595 6.118a3.28 3.28 0 0 1-3.28 0l-10.595-6.118a3.28 3.28 0 0 1-1.64-2.839V49.712c0-1.172.625-2.254 1.64-2.84l10.595-6.117a3.28 3.28 0 0 1 3.28 0zm-14.448-.674-7.235 4.176v8.354l7.235-4.177Zm11.661 12.53v-8.354l-7.235-4.176v8.353Zm-16.682 3.834 7.234 4.177 7.234-4.177-7.234-4.177Zm-15.177-15.69a3.28 3.28 0 0 1 1.639 2.84v12.235a3.28 3.28 0 0 1-1.639 2.839l-10.596 6.118a3.28 3.28 0 0 1-3.279 0l-10.595-6.118a3.28 3.28 0 0 1-1.64-2.839V49.712c0-1.172.625-2.254 1.64-2.84l10.595-6.117a3.28 3.28 0 0 1 3.279 0zm-14.449-.674-7.234 4.176v8.354l7.234-4.177Zm11.661 12.53v-8.354l-7.234-4.176v8.353Zm-16.682 3.834 7.235 4.177 7.234-4.177-7.234-4.177Zm36.793-45.793a3.28 3.28 0 0 1 1.639 2.84v12.234a3.28 3.28 0 0 1-1.639 2.84l-10.596 6.118a3.28 3.28 0 0 1-3.279 0l-10.595-6.118a3.28 3.28 0 0 1-1.64-2.84V19.609c0-1.172.625-2.254 1.64-2.84l10.595-6.118a3.28 3.28 0 0 1 3.279 0zm-14.449-.675-7.234 4.177v8.354l7.234-4.177Zm11.662 12.531v-8.354l-7.235-4.177v8.354Zm-16.683 3.834 7.235 4.176 7.234-4.176-7.234-4.177Z';

const letters =
  'M139.515 29.753h-10.864V16.256h-12.067v13.497h-8.633v10.275h8.633v14.891c0 9.217 4.571 14.153 15.432 14.153h7.499V58.285h-5.268c-3.914 0-5.596-1.39-5.596-5.305V40.028h10.864Zm48.141 21.432c5.595-3.108 8.411-8.483 8.411-16.13 0-5.671-1.682-10.243-5.01-13.68-3.364-3.401-8.484-5.119-15.399-5.119h-28.896v52.45h12.433V53.781h17.524l7.939 14.925h12.506Zm-13.498-23.924c6.622 0 9.476 2.489 9.476 7.794 0 5.233-2.89 7.721-9.476 7.721h-14.963V27.261Zm29.814-11.005v52.45h12.433V56.488h16.098c6.988 0 12.217-1.864 15.655-5.557 3.4-3.693 5.119-8.559 5.119-14.596s-1.719-10.902-5.119-14.595c-3.438-3.656-8.667-5.484-15.655-5.484Zm12.433 29.227V27.261h14.671c6.512 0 9.768 3.037 9.768 9.074-.036 6.111-3.292 9.148-9.768 9.148Zm71.659 13.022c-5.012 0-8.852-1.464-11.596-4.427-2.743-2.927-4.133-6.805-4.133-11.597 0-4.793 1.39-8.634 4.133-11.597 2.744-2.964 6.584-4.427 11.596-4.427 7.279 0 11.998 3.183 14.156 9.512h12.144c-1.097-6.585-3.95-11.706-8.523-15.363-4.609-3.62-10.534-5.448-17.777-5.448-8.669 0-15.583 2.596-20.666 7.752-5.082 5.157-7.642 11.705-7.642 19.571 0 7.902 2.56 14.451 7.642 19.607s11.997 7.752 20.666 7.752q10.864 0 17.777-5.485c4.573-3.656 7.426-8.777 8.523-15.362H302.22c-2.158 6.329-6.877 9.512-14.156 9.512';

function Mark(props: { readonly id: string }) {
  return (
    <>
      <defs>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={`${props.id}-tile`}
          x1="0"
          x2={tile}
          y1={tile}
          y2="0"
        >
          <stop stopColor="#066dfc" />
          <stop offset="1" stopColor="#22d4fc" />
        </linearGradient>
        {connectors.map((connector, index) => (
          <linearGradient
            gradientUnits="userSpaceOnUse"
            id={`${props.id}-${index}`}
            key={connector.d}
            x1={connector.from[0]}
            x2={connector.to[0]}
            y1={connector.from[1]}
            y2={connector.to[1]}
          >
            <stop stopColor="#fff" stopOpacity={connector.fade} />
            <stop offset="1" stopColor="#fff" />
          </linearGradient>
        ))}
      </defs>
      <rect
        fill={`url(#${props.id}-tile)`}
        height={tile}
        rx="12.738"
        width={tile}
      />
      <g strokeLinejoin="round" strokeWidth="4.427">
        {connectors.map((connector, index) => (
          <path
            d={connector.d}
            key={connector.d}
            stroke={`url(#${props.id}-${index})`}
          />
        ))}
      </g>
      <path d={cubes} fill="#fff" fillRule="evenodd" />
    </>
  );
}

/** The tRPC mark and name, as `public/img/logo-text-*.svg`, the name in the text's color. */
export function Wordmark(props: { readonly className?: string }) {
  const id = useId();
  return (
    <svg
      aria-hidden="true"
      className={cn('h-6 w-auto shrink-0', props.className)}
      fill="none"
      viewBox={`0 0 ${wordmarkWidth} ${tile}`}
    >
      <Mark id={id} />
      <path d={letters} fill="currentColor" />
    </svg>
  );
}
