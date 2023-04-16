import clsx from 'clsx';
import { motion } from 'framer-motion';
import React, { FC, ReactNode } from 'react';
import { popIn } from '../animations/popIn';

type SectionTitleProps = {
  id: string;
  title: ReactNode;
  description?: ReactNode;
};

export const SectionTitle: FC<SectionTitleProps> = (props) => {
  return (
    <motion.div
      variants={popIn}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      className="text-center"
    >
      <h2
        id={props.id}
        className={clsx(
          'scroll-mt-20 text-2xl font-bold text-black hover:no-underline dark:text-white lg:text-3xl',
        )}
      >
        {props.title}
        <a className="hash-link" href={`#${props.id}`}></a>
      </h2>
      {props.description && (
        <p className="mx-auto max-w-[60ch] pt-2 text-sm text-zinc-600 dark:text-zinc-300 md:text-base">
          {props.description}
        </p>
      )}
    </motion.div>
  );
};
