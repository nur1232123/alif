// В веб-версии напоминаний нет: они работают только в приложении на телефоне
export const AndroidImportance = { HIGH: 4 };
export const IosAuthorizationStatus = { PROVISIONAL: 3 };
export const SchedulableTriggerInputTypes = { DAILY: 'daily' };
export function setNotificationHandler() {}
export async function setNotificationChannelAsync() {}
export async function requestPermissionsAsync() {
  return { granted: false };
}
export async function cancelAllScheduledNotificationsAsync() {}
export async function scheduleNotificationAsync() {}
