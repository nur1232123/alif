import { useScheme } from './scheme';

// Палитра зеллиджа: глазурованная зелёная плитка, шафрановая звезда, светлая глина
const light = {
  bg: '#EDF3EF',
  surface: '#FFFFFF',
  soft: '#D6EAE3',
  ink: '#10302A',
  muted: '#4F6B64',
  line: '#CBDBD4',
  accent: '#0B6E5F',
  onAccent: '#FFFFFF',
  gold: '#B97F00',
  goldSoft: '#F7E7BC',
  good: '#1B7A43',
  goodSoft: '#D8F0E0',
  bad: '#B3362B',
  badSoft: '#F8DEDA',
};

const dark: typeof light = {
  bg: '#0C1C19',
  surface: '#132925',
  soft: '#17362F',
  ink: '#E8F2EE',
  muted: '#9DB6AF',
  line: '#27463F',
  accent: '#4CC2A9',
  onAccent: '#06231E',
  gold: '#F1B93A',
  goldSoft: '#3A2F12',
  good: '#5BD08D',
  goodSoft: '#143325',
  bad: '#F0806F',
  badSoft: '#3D1D19',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useScheme() === 'dark' ? dark : light;
}

export const fonts = {
  regular: 'GolosText_400Regular',
  medium: 'GolosText_500Medium',
  bold: 'GolosText_700Bold',
  arabic: 'ScheherazadeNew_400Regular',
  arabicBold: 'ScheherazadeNew_700Bold',
};
