'use client';

import * as HoverCardPrimitive from '@radix-ui/react-hover-card';
import { clsx } from 'clsx';
import * as React from 'react';

const HoverCard = HoverCardPrimitive.Root;

const HoverCardTrigger = HoverCardPrimitive.Trigger;

const HoverCardContent = React.forwardRef<
  React.ElementRef<typeof HoverCardPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(({ className, align = 'center', sideOffset = 4, ...props }, ref) => (
  <HoverCardPrimitive.Content
    ref={ref}
    align={align}
    sideOffset={sideOffset}
    className={clsx(
      'animate-in zoom-in-90 z-50 w-64 rounded-md border border-gray-100 bg-white p-4 shadow-md outline-none dark:border-gray-800 dark:bg-gray-800',
      className,
    )}
    {...props}
  />
));
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName;

export { HoverCard, HoverCardTrigger, HoverCardContent };
