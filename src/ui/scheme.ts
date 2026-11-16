// В веб-версии этот файл заменяется на web/shims/scheme.ts
import { useColorScheme } from 'react-native';
import { useThemePref } from './theme-pref';

/** Тема экрана: выбор в настройках, а если «как в телефоне» — системная */
export function useScheme() {
  const system = useColorScheme();
  const pref = useThemePref();
  return pref === 'system' ? system : pref;
}
