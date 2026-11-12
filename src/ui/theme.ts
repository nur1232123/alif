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
  shadow: '0px 1px 2px rgba(16, 48, 42, 0.06), 0px 4px 14px rgba(16, 48, 42, 0.07)',
  lift: '0px 2px 6px rgba(11, 110, 95, 0.25)',
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
  shadow: '0px 1px 2px rgba(0, 0, 0, 0.35)',
  lift: '0px 2px 6px rgba(0, 0, 0, 0.35)',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useScheme() === 'dark' ? dark : light;
}

export const fonts = {
  regular: 'GolosText_400Regular',
  medium: 'GolosText_500Medium',
  // Полужирный (600): мягче, чем жирный 700
  bold: 'GolosText_600SemiBold',
  arabic: 'ScheherazadeNew_400Regular',
  arabicBold: 'ScheherazadeNew_700Bold',
};
