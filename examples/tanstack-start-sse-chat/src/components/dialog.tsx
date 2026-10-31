import * as Headless from '@headlessui/react';
import { cx } from 'class-variance-authority';
import type React from 'react';

const sizes = {
  xs: 'sm:max-w-xs',
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
  '2xl': 'sm:max-w-2xl',
  '3xl': 'sm:max-w-3xl',
  '4xl': 'sm:max-w-4xl',
  '5xl': 'sm:max-w-5xl',
};

export function Dialog({
  open,
  onClose,
  size = 'lg',
  className,
  children,
  ...props
}: {
  size?: keyof typeof sizes;
  className?: string;
  children: React.ReactNode;
} & Omit<Headless.DialogProps, 'className'>) {
  return (
    <Headless.Transition appear show={open} {...props}>
      <Headless.Dialog onClose={onClose}>
        <Headless.TransitionChild
          enter="ease-out duration-100"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 flex w-screen justify-center overflow-y-auto bg-gray-950/25 px-2 py-2 focus:outline-0 dark:bg-gray-950/50 sm:px-6 sm:py-8 lg:px-8 lg:py-16" />
        </Headless.TransitionChild>

        <div className="fixed inset-0 w-screen overflow-y-auto pt-6 sm:pt-0">
          <div className="grid min-h-full grid-rows-[1fr_auto] justify-items-center sm:grid-rows-[1fr_auto_3fr] sm:p-4">
            <Headless.TransitionChild
              enter="ease-out duration-100"
              enterFrom="opacity-0 translate-y-12 sm:translate-y-0 sm:scale-95"
              enterTo="opacity-100 translate-y-0 sm:scale-100"
              leave="ease-in duration-100"
              leaveFrom="opacity-100 translate-y-0"
              leaveTo="opacity-0 translate-y-12 sm:translate-y-0"
            >
              <Headless.DialogPanel
                className={cx(
                  className,
                  sizes[size],
                  'row-start-2 w-full min-w-0 rounded-t-3xl bg-white p-[--gutter] shadow-lg ring-1 ring-gray-950/10 [--gutter:theme(spacing.8)] dark:bg-gray-900 dark:ring-white/10 sm:mb-auto sm:rounded-2xl forced-colors:outline',
                )}
              >
                {children}
              </Headless.DialogPanel>
            </Headless.TransitionChild>
          </div>
        </div>
      </Headless.Dialog>
    </Headless.Transition>
  );
}

export function DialogTitle({
  className,
  ...props
}: { className?: string } & Omit<Headless.DialogTitleProps, 'className'>) {
  return (
    <Headless.DialogTitle
      {...props}
      className={cx(
        className,
        'text-balance text-lg/6 font-semibold text-zinc-950 dark:text-white sm:text-base/6',
      )}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: { className?: string } & Omit<Headless.DescriptionProps, 'className'>) {
  return (
    <Headless.Description
      {...props}
      className={cx(className, 'mt-2 text-pretty')}
    />
  );
}

export function DialogBody({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return <div {...props} className={cx(className, 'mt-6')} />;
}

export function DialogActions({
  className,
  ...props
}: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div
      {...props}
      className={cx(
        className,
        'mt-8 flex flex-col-reverse items-center justify-end gap-3 *:w-full sm:flex-row sm:*:w-auto',
      )}
    />
  );
}
