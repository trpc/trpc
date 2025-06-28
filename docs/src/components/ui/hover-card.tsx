'use client';

import { cn } from '@/lib/cn';
import * as HoverCardPrimitive from '@radix-ui/react-hover-card';
import * as React from 'react';

const HoverCard = HoverCardPrimitive.Root;

const HoverCardTrigger = HoverCardPrimitive.Trigger;

const HoverCardContent = React.forwardRef<
  React.ComponentRef<typeof HoverCardPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(({ className, align = 'center', sideOffset = 4, ...props }, ref) => (
  <HoverCardPrimitive.HoverCardPortal>
    <HoverCardPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'bg-fd-popover text-popover-fd-foreground data-[state=open]:animate-fd-popover-in data-[state=closed]:animate-fd-popover-out z-50 w-72 origin-[--radix-hover-card-content-transform-origin] rounded-lg border p-4 shadow-md outline-none',
        className,
      )}
      {...props}
    />
  </HoverCardPrimitive.HoverCardPortal>
));
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName;

export { HoverCard, HoverCardTrigger, HoverCardContent };
