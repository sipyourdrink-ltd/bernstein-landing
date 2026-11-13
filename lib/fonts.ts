import localFont from 'next/font/local';

export const inter = localFont({
  src: './fonts/spines/inter-latin-wght-normal.woff2',
  weight: '100 900',
  variable: '--font-inter',
  display: 'swap',
});

export const jetbrainsMono = localFont({
  src: './fonts/spines/jetbrains-mono-latin-400-normal.woff2',
  weight: '400',
  variable: '--font-jetbrains',
  display: 'swap',
});

export const sourceSerif = localFont({
  src: './fonts/spines/source-serif-4-latin-standard-normal.woff2',
  weight: '200 900',
  variable: '--font-source-serif',
  display: 'swap',
});
