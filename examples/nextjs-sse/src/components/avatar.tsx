import { cx } from 'class-variance-authority';
import React from 'react';

type AvatarProps = {
  src?: string | null;
  square?: boolean;
  initials?: string;
  alt?: string;
  className?: string;
} & React.ComponentPropsWithoutRef<'span'>;

export function Avatar({
  src = null,
  square = false,
  initials,
  alt = '',
  className,
  ...props
}: AvatarProps) {
  return (
    <span
      {...props}
      className={cx(
        className,
        // Basic layout
        'inline-grid shrink-0 align-middle [--avatar-radius:20%] [--ring-opacity:20%] *:col-start-1 *:row-start-1',
        'outline outline-1 -outline-offset-1 outline-black/[--ring-opacity] dark:outline-white/[--ring-opacity]',
        // Add the correct border radius
        square
          ? 'rounded-[--avatar-radius] *:rounded-[--avatar-radius]'
          : 'rounded-full *:rounded-full',
      )}
    >
      {initials && (
        <svg
          className="size-full select-none fill-current text-[48px] font-medium uppercase"
          viewBox="0 0 100 100"
          aria-hidden={alt ? undefined : 'true'}
        >
          {alt && <title>{alt}</title>}
          <text
            x="50%"
            y="50%"
            alignmentBaseline="middle"
            dominantBaseline="middle"
            textAnchor="middle"
            dy=".125em"
          >
            {initials}
          </text>
        </svg>
      )}
      {src && <img className="size-full" src={src} alt={alt} />}
    </span>
  );
}
