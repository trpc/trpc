import Link, { Props as LinkProps } from '@docusaurus/Link';
import { clsx } from 'clsx';
import React from 'react';

type AnchorProps = LinkProps & { href: string };
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  ({ type: 'submit' } | { onClick: React.MouseEvent<HTMLButtonElement> });

type Props = (AnchorProps | ButtonProps) & {
  variant: 'primary' | 'secondary' | 'tertiary';
};

export const Button = ({
  variant,
  className: _className,
  children,
  ...props
}: Props) => {
  const className = clsx(
    'inline-grid appearance-none cursor-pointer text-sm sm:text-base font-bold tracking-normal px-2 sm:px-4 py-1.5 sm:py-2 gap-1 sm:gap-1.5 grid-flow-col rounded-lg shadow-xl shadow-sky-500/20 no-underline hover:no-underline justify-center items-center transition-all duration-300',
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

  if ('href' in props) {
    const rel = clsx({ ['noopener']: props.target === '_blank' });
    return (
      <Link {...props} className={className} rel={props.rel || rel}>
        {children}
      </Link>
    );
  }

  return (
    <button {...props} className={className} type={props.type || 'button'}>
      {children}
    </button>
  );
};
