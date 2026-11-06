import { useSyncExternalStore } from 'react';

// Страница следует теме просмотрщика: явный выбор в data-theme важнее системной настройки
const query = () => window.matchMedia('(prefers-color-scheme: dark)');

function subscribe(onChange: () => void) {
  const media = query();
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  media.addEventListener('change', onChange);
  return () => {
    observer.disconnect();
    media.removeEventListener('change', onChange);
  };
}

function current() {
  const chosen = document.documentElement.getAttribute('data-theme');
  if (chosen === 'dark' || chosen === 'light') return chosen;
  return query().matches ? 'dark' : 'light';
}

export function useScheme() {
  return useSyncExternalStore(subscribe, current);
}
