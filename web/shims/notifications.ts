// В веб-версии напоминаний нет: они работают только в приложении на телефоне
export const AndroidImportance = { HIGH: 4 };
export const IosAuthorizationStatus = { PROVISIONAL: 3 };
export const SchedulableTriggerInputTypes = { DAILY: 'daily', DATE: 'date' };
export function setNotificationHandler() {}
export async function setNotificationChannelAsync() {}
export async function requestPermissionsAsync() {
  return { granted: false };
}
export async function cancelAllScheduledNotificationsAsync() {}
export async function scheduleNotificationAsync() {}
export async function getAllScheduledNotificationsAsync() {
  return [];
}
export async function cancelScheduledNotificationAsync() {}
export async function setNotificationCategoryAsync() {}
export async function dismissNotificationAsync() {}
export function addNotificationResponseReceivedListener() {
  return { remove() {} };
}
export async function getLastNotificationResponseAsync() {
  return null;
}
