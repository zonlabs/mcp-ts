'use client'

import * as React from 'react'

import type { VariantProps } from 'class-variance-authority'

import { Button, buttonVariants } from '@/components/ui/button'

import { BorderBeam } from '@/components/ui/border-beam'

import { cn } from '@/lib/utils'

interface NeuralButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: VariantProps<typeof buttonVariants>['size']
  children?: React.ReactNode
  asChild?: boolean
}

function NeuralButton(props: NeuralButtonProps) {
  const { children, asChild = false, size, className, ...rest } = props

  const neuralStyles = cn(
    'relative z-1 overflow-hidden rounded-xl bg-white text-zinc-900 ring-2 ring-red-300/80 transition-transform duration-200 ease-in-out hover:scale-105 active:scale-95 dark:bg-zinc-900 dark:text-white dark:ring-red-400/70',

    // size-based adjustments
    size === 'lg' && 'text-base has-[>svg]:px-6',

    className
  )

  const backgroundDecorations = (
    <>
      <span className='pointer-events-none absolute inset-0 -z-1 hidden dark:block'>
        <span className='absolute inset-px rounded-[calc(var(--radius-xl)-1px)] bg-white dark:bg-zinc-900' />
      </span>

      <svg
        width='98'
        height='40'
        viewBox='0 0 98 40'
        fill='none'
        xmlns='http://www.w3.org/2000/svg'
        className='absolute inset-x-0 bottom-px hidden h-12 w-full! blur-[6px] dark:block'
      >
        <g filter='url(#filter0_f_28138_7760)'>
          <path
            d='M99 37.5708C60.3329 38.179 38.3917 38.106 -1 37.5708C-1 37.5708 2.65293 34.4541 7.59896 29.7774C12.545 25.1008 81.7895 24.0613 90.3618 30.737C98.9341 37.4128 99 37.5708 99 37.5708Z'
            fill='white'
          />
        </g>
        <defs>
          <filter
            id='filter0_f_28138_7760'
            x='-28.9'
            y='-1.9'
            width='155.8'
            height='67.8'
            filterUnits='userSpaceOnUse'
            colorInterpolationFilters='sRGB'
          >
            <feFlood floodOpacity='0' result='BackgroundImageFix' />
            <feBlend mode='normal' in='SourceGraphic' in2='BackgroundImageFix' result='shape' />
            <feGaussianBlur stdDeviation='13.95' result='effect1_foregroundBlur_28138_7760' />
          </filter>
        </defs>
      </svg>
    </>
  )

  const overlayDecorations = (
    <>
      <BorderBeam colorFrom='#ef4444' colorTo='#ef4444' size={35} />
    </>
  )

  if (asChild && React.isValidElement(children)) {
    const childProps = children.props as any

    return React.cloneElement(children, {
      className: cn(
        buttonVariants({ variant: 'default', size: size }),
        neuralStyles,
        'bg-transparent hover:bg-transparent active:bg-transparent dark:bg-transparent dark:hover:bg-transparent dark:active:bg-transparent',
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
    <Button size={size} className={neuralStyles} {...rest}>
      {backgroundDecorations}
      {children}
      {overlayDecorations}
    </Button>
  )
}

export { NeuralButton, type NeuralButtonProps }
