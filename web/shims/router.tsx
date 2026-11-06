import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';

// Простой переход между экранами в памяти: адрес страницы внутри просмотрщика менять нельзя
let stack = ['/'];
const listeners = new Set<() => void>();

function set(next: string[]) {
  stack = next;
  listeners.forEach((fn) => fn());
}

export const router = {
  push: (path: string) => set([...stack, path]),
  replace: (path: string) => set([...stack.slice(0, -1), path]),
  back: () => set(stack.length > 1 ? stack.slice(0, -1) : stack),
  canGoBack: () => stack.length > 1,
};

export function usePath() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => stack[stack.length - 1],
  );
}

export const ParamsContext = createContext<{ id?: string }>({});

export function useLocalSearchParams<T>() {
  return useContext(ParamsContext) as T;
}

export function Redirect({ href }: { href: string }) {
  useEffect(() => {
    router.replace(href);
  }, [href]);
  return null;
}
