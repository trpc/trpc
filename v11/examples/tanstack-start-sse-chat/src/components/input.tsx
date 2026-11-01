import * as Headless from '@headlessui/react';
import { cx } from 'class-variance-authority';
import * as React from 'react';

export function Input({
  className,
  type,
  ref,
  ...props
}: { className?: string; ref?: React.Ref<HTMLInputElement> } & Omit<
  Headless.InputProps,
  'className'
>) {
  return (
    <Headless.Input
      type={type}
      className={cx(
        'block w-full rounded-lg border-none bg-gray-300/5 px-3 py-2 text-sm/6 dark:text-white',
        'focus:outline-none data-[focus]:outline-2 data-[focus]:-outline-offset-2 data-[focus]:outline-gray-950 dark:data-[focus]:outline-gray-300',
        className,
      )}
      ref={ref}
      {...props}
    />
  );
}

export function Label({
  className,
  ref,
  ...props
}: { className?: string; ref?: React.Ref<HTMLLabelElement> } & Omit<
  Headless.LabelProps,
  'className'
>) {
  return (
    <Headless.Label
      ref={ref}
      {...props}
      className={cx(
        className,
        'select-none text-base/6 text-zinc-950 data-[disabled]:opacity-50 dark:text-white sm:text-sm/6',
      )}
    />
  );
}

export function Textarea({
  className,
  ref,
  ...props
}: { className?: string; ref?: React.Ref<HTMLTextAreaElement> } & Omit<
  Headless.TextareaProps,
  'className'
>) {
  return (
    <Headless.Textarea
      className={cx(
        'block min-h-[80px] w-full resize-none rounded-lg border-none bg-gray-300/5 px-3 py-2 text-sm/6 dark:text-white',
        'focus:outline-none data-[focus]:outline-2 data-[focus]:-outline-offset-2 data-[focus]:outline-gray-950 dark:data-[focus]:outline-gray-300',
      )}
      ref={ref}
      {...props}
    />
  );
}
