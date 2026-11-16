import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

/** Выбор темы в настройках: как в телефоне, всегда светлая или всегда тёмная. Хранится на этом телефоне */
export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'alif.theme.v1';
let pref: ThemePref = 'system';
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());

AsyncStorage.getItem(KEY)
  .then((saved) => {
    if (saved === 'light' || saved === 'dark') {
      pref = saved;
      notify();
    }
  })
  .catch(() => {});

export function setThemePref(next: ThemePref) {
  pref = next;
  AsyncStorage.setItem(KEY, next).catch(() => {});
  notify();
}

const subscribe = (onChange: () => void) => {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
};

export function useThemePref() {
  return useSyncExternalStore(subscribe, () => pref, () => pref);
}
