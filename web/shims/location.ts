// В веб-версии GPS нет: город выбирают из списка
export const Accuracy = { Low: 2 };
export async function requestForegroundPermissionsAsync() {
  return { granted: false };
}
export async function getCurrentPositionAsync(): Promise<{ coords: { latitude: number; longitude: number } }> {
  throw new Error('нет GPS в веб-версии');
}
export async function reverseGeocodeAsync() {
  return [];
}
export async function watchHeadingAsync() {
  return { remove() {} };
}
