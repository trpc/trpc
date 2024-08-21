import type { Props as LinkProps } from '@docusaurus/Link';
import Link from '@docusaurus/Link';
import { clsx } from 'clsx';
import React from 'react';

type ExternalLink = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  external: true;
};
type InternalLink = LinkProps & { href: string };
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  ({ onClick: React.MouseEvent<HTMLButtonElement> } | { type: 'submit' });

type Props = {
  variant: 'primary' | 'secondary' | 'tertiary';
} & (InternalLink | ButtonProps | ExternalLink);

export const Button = ({
  variant,
  className: _className,
  children,
  ...props
}: Props) => {
  const className = clsx(
    'inline-grid cursor-pointer appearance-none grid-flow-col items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-sm font-bold tracking-normal no-underline shadow-xl shadow-sky-500/20 transition-all duration-300 hover:no-underline sm:gap-1.5 sm:px-4 sm:py-2 sm:text-base',
    {
      ['bg-primary text-white hover:text-white hover:bg-primary-dark']:
        variant === 'primary',
      ['bg-gradient-to-r from-sky-50 to-sky-200 text-slate-800 hover:text-primary-darker']:
        variant === 'secondary',
      ['bg-gradient-to-r dark:from-neutral-800 dark:to-neutral-800 text-white from-neutral-200 to-neutral-300 shadow-none']:
        variant === 'tertiary',
    },
    _className,
  );

  if ('external' in props) {
    const {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      external,
      ...rest
    } = props;
    return (
      <a {...rest} className={className}>
        {children}
      </a>
    );
  }
  if ('href' in props) {
    const rel = clsx({ ['noopener']: props.target === '_blank' });
    return (
      <Link {...props} className={className} rel={props.rel ?? rel}>
        {children}
      </Link>
    );
  }

  return (
    <button {...props} className={className} type={props.type ?? 'button'}>
      {children}
    </button>
  );
};
