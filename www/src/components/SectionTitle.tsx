import clsx from 'clsx';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import React from 'react';
import { popIn } from '../animations/popIn';

type SectionTitleProps = {
  id: string;
  title: ReactNode;
  description?: ReactNode;
};

export function SectionTitle(props: SectionTitleProps) {
  return (
    <motion.div
      variants={popIn}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
    >
      <h2
        id={props.id}
        className={clsx(
          'scroll-mt-20 text-center text-2xl font-bold text-black hover:no-underline dark:text-white lg:text-3xl',
        )}
      >
        {props.title}
        <a className="hash-link" href={`#${props.id}`}></a>
      </h2>
      {props.description && (
        <SectionTitle.Description>{props.description}</SectionTitle.Description>
      )}
    </motion.div>
  );
}

SectionTitle.Description = function SectionTitleDescription(props: {
  children: ReactNode;
}) {
  return (
    <p className="mx-auto max-w-[60ch] pt-2 text-center text-sm text-zinc-600 dark:text-zinc-300 md:text-base">
      {props.children}
    </p>
  );
};
