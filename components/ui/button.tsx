import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { Pressable } from 'react-native';

import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';

const buttonVariants = cva('flex flex-row items-center justify-center rounded-lg', {
  variants: {
    variant: {
      default: 'bg-primary active:opacity-90',
      destructive: 'bg-destructive active:opacity-90',
      outline: 'border border-input bg-background active:bg-accent',
      secondary: 'bg-secondary active:opacity-80',
      ghost: 'active:bg-accent',
      link: '',
    },
    size: {
      default: 'h-12 px-5 py-3',
      sm: 'h-10 px-3',
      lg: 'h-14 px-8',
      icon: 'h-12 w-12',
    },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

const buttonTextVariants = cva('text-base font-medium', {
  variants: {
    variant: {
      default: 'text-primary-foreground',
      destructive: 'text-destructive-foreground',
      outline: 'text-foreground',
      secondary: 'text-secondary-foreground',
      ghost: 'text-foreground',
      link: 'text-primary underline',
    },
    size: { default: '', sm: 'text-sm', lg: 'text-lg', icon: '' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});

type ButtonProps = React.ComponentProps<typeof Pressable> & VariantProps<typeof buttonVariants>;

function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant, size })}>
      <Pressable
        className={cn(
          props.disabled && 'opacity-50',
          buttonVariants({ variant, size }),
          className
        )}
        role="button"
        {...props}
      />
    </TextClassContext.Provider>
  );
}

export { Button, buttonTextVariants, buttonVariants };
export type { ButtonProps };
