import { Inter, JetBrains_Mono, Fraunces } from 'next/font/google';

/* Display serif used for hero, section headlines, italic accents.
   Variable font - restrained weight + style coverage to stay inside the
   ≤120KB total font-payload budget set in the redesign spec. */
export const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
  weight: ['400', '500', '700'],
  style: ['normal', 'italic'],
});

export const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
  weight: ['400', '500', '600'],
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
  weight: ['400', '500'],
});
