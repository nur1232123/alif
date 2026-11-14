// В веб-версии встроенного браузера нет: ссылка открывается в новой вкладке
export enum WebBrowserPresentationStyle {
  FULL_SCREEN = 'fullScreen',
  PAGE_SHEET = 'pageSheet',
  FORM_SHEET = 'formSheet',
}
export async function openBrowserAsync(url: string) {
  window.open(url, '_blank', 'noopener');
  return { type: 'opened' as const };
}
