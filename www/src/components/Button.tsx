import Link, { Props as LinkProps } from '@docusaurus/Link';
import { clsx } from 'clsx';
import React from 'react';

type AnchorProps = LinkProps & { href: string };
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  ({ type: 'submit' } | { onClick: React.MouseEvent<HTMLButtonElement> });

type Props = (AnchorProps | ButtonProps) & {
  primary?: boolean;
  secondary?: boolean;
};

export const Button = ({
  primary,
  secondary,
  className: _className,
  children,
  ...props
}: Props) => {
  const className = clsx(
    'inline-grid appearance-none cursor-pointer font-bold tracking-normal px-4 py-2 gap-1.5 grid-flow-col rounded-lg shadow-xl shadow-sky-500/20 no-underline hover:no-underline justify-center items-center transition-all duration-300 ',
    {
      ['bg-primary text-white hover:text-white hover:bg-sky-700']: primary,
      ['bg-gradient-to-r from-sky-50 to-sky-200 text-slate-800 hover:text-primary-darker']:
        secondary,
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
