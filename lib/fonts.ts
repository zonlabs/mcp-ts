import { Inter, DM_Mono, Spectral } from 'next/font/google'

export const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-dm-mono',
  display: 'swap',
})

export const instrumentSerif = Spectral({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-instrument-serif',
  display: 'swap',
})

// Legacy aliases to maintain backward compatibility with components using old variable names
export const plusJakartaSans = inter
export const geistMono = dmMono
