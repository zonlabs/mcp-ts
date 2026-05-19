'use client'

import * as React from 'react'
import type { VariantProps } from 'class-variance-authority'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface NeuralButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: VariantProps<typeof buttonVariants>['size']
  children?: React.ReactNode
  asChild?: boolean
}

function NeuralButton(props: NeuralButtonProps) {
  const { children, asChild = false, size, className, ...rest } = props

  const neuralStyles = cn(
    'relative z-1 overflow-hidden rounded-xl border border-white/90 bg-zinc-950 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.12)] transition-transform duration-200 ease-in-out hover:scale-[1.02] active:scale-[0.98] dark:bg-zinc-950 dark:text-white dark:border-white/80',

    // size-based adjustments
    size === 'lg' && 'text-base has-[>svg]:px-6',

    className
  )

  const backgroundDecorations = (
    <>
      <span className='pointer-events-none absolute inset-0 -z-1'>
        <span className='absolute inset-px rounded-[calc(var(--radius-xl)-1px)] bg-zinc-950 dark:bg-zinc-950' />
      </span>
    </>
  )

  const overlayDecorations = (
    <>
      <span
        aria-hidden='true'
        className='pointer-events-none absolute inset-y-[3px] left-[-30%] w-1/3 rounded-full bg-white/30 blur-md transition-transform duration-700 ease-out group-hover:translate-x-[260%]'
      />
    </>
  )

  if (asChild && React.isValidElement(children)) {
    const childProps = children.props as any

    return React.cloneElement(children, {
      className: cn(
        buttonVariants({ variant: 'default', size: size }),
        neuralStyles,
        'group bg-zinc-950 hover:bg-zinc-900 active:bg-zinc-950 dark:bg-zinc-950 dark:hover:bg-zinc-900 dark:active:bg-zinc-950',
        childProps.className
      ),
      ...rest,
      children: (
        <>
          {backgroundDecorations}
          {childProps.children}
          {overlayDecorations}
        </>
      )
    } as any)
  }

  return (
    <Button size={size} className={cn('group bg-zinc-950 hover:bg-zinc-900 active:bg-zinc-950 dark:bg-zinc-950 dark:hover:bg-zinc-900', neuralStyles)} {...rest}>
      {backgroundDecorations}
      {children}
      {overlayDecorations}
    </Button>
  )
}

export { NeuralButton, type NeuralButtonProps }
