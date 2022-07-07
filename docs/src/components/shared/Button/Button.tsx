import clsx from 'clsx';
import Link from 'next/link';
import React, { FC } from 'react';
import styles from './Button.module.css';

type BaseProps = {
  variant?: 'primary' | 'secondary';
  children: React.ReactNode;
};

type LinkProps = {
  href: string;
  onClick?: undefined;
};

type ButtonProps = {
  href?: undefined;
  onClick: () => void;
};

type Props = BaseProps & (LinkProps | ButtonProps);

export const Button: FC<Props> = ({
  variant = 'primary',
  href,
  children,
  onClick,
}) => {
  const className = clsx(styles.button, styles[variant]);

  return (
    <>
      {href ? (
        <Link href={href}>
          <a className={className}>
            <span>{children}</span>
          </a>
        </Link>
      ) : (
        <button className={className} onClick={onClick}>
          <span>{children}</span>
        </button>
      )}
    </>
  );
};
