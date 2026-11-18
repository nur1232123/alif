import AsyncStorage from '@react-native-async-storage/async-storage';
import { CalculationMethod, Coordinates, HighLatitudeRule, Madhab, PrayerTimes, Qibla } from 'adhan';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Время намаза считается на телефоне по координатам: местоположение никуда не отправляется

export type PrayerKey = 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
export const PRAYERS: { key: PrayerKey; ru: string; ar: string }[] = [
  { key: 'fajr', ru: 'Фаджр', ar: 'الفَجْر' },
  { key: 'sunrise', ru: 'Восход', ar: 'الشُّرُوق' },
  { key: 'dhuhr', ru: 'Зухр', ar: 'الظُّهْر' },
  { key: 'asr', ru: 'Аср', ar: 'العَصْر' },
  { key: 'maghrib', ru: 'Магриб', ar: 'المَغْرِب' },
  { key: 'isha', ru: 'Иша', ar: 'العِشَاء' },
];
/** Пять обязательных намазов: восход — не намаз, а конец времени фаджра */
export const FARD: PrayerKey[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

export type MethodId = 'MuslimWorldLeague' | 'UmmAlQura' | 'Egyptian' | 'Karachi' | 'Dubai' | 'Turkey' | 'Kuwait' | 'Qatar' | 'MoonsightingCommittee' | 'NorthAmerica';
export const METHODS: { id: MethodId; ru: string }[] = [
  { id: 'MuslimWorldLeague', ru: 'Всемирная исламская лига' },
  { id: 'UmmAlQura', ru: 'Умм аль-Кура (Мекка)' },
  { id: 'Egyptian', ru: 'Египет' },
  { id: 'Karachi', ru: 'Карачи' },
  { id: 'Dubai', ru: 'Дубай' },
  { id: 'Turkey', ru: 'Турция (Диянет)' },
  { id: 'Kuwait', ru: 'Кувейт' },
  { id: 'Qatar', ru: 'Катар' },
  { id: 'MoonsightingCommittee', ru: 'Комитет по наблюдению луны' },
  { id: 'NorthAmerica', ru: 'Северная Америка (ISNA)' },
];

export type Sound = 'full' | 'short' | 'plain';
export type Place = { lat: number; lng: number; name: string };
export type PrayerSettings = {
  place: Place | null;
  method: MethodId;
  madhab: 'shafi' | 'hanafi';
  notify: boolean;
  sound: Sound;
  on: Record<PrayerKey, boolean>;
  /** За сколько минут до намаза предупредить, 0 — не предупреждать */
  before: number;
};

const KEY = 'alif.prayer.v1';
const TRACK_KEY = 'alif.prayer.track.v1';

/** Метод и мазхаб по умолчанию по часовому поясу телефона */
function defaults(): PrayerSettings {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  const method: MethodId = tz === 'Asia/Riyadh' ? 'UmmAlQura' : tz === 'Asia/Dubai' || tz === 'Asia/Muscat' ? 'Dubai' : tz === 'Europe/Istanbul' ? 'Turkey'
    : tz === 'Africa/Cairo' ? 'Egyptian' : tz === 'Asia/Karachi' ? 'Karachi' : tz === 'Asia/Kuwait' ? 'Kuwait' : tz === 'Asia/Qatar' || tz === 'Asia/Bahrain' ? 'Qatar'
      : tz.startsWith('America/') ? 'NorthAmerica' : 'MuslimWorldLeague';
  // В России и Средней Азии чаще следуют ханафитскому мазхабу: аср позже
  const hanafi = /^(Europe\/(Moscow|Samara|Volgograd|Kirov|Ulyanovsk|Saratov|Astrakhan|Simferopol)|Asia\/(Tashkent|Samarkand|Bishkek|Almaty|Qostanay|Aqtobe|Dushanbe|Ashgabat|Yekaterinburg|Omsk|Novosibirsk|Kabul|Karachi))/.test(tz);
  return {
    place: null,
    method,
    madhab: hanafi ? 'hanafi' : 'shafi',
    notify: false,
    sound: 'full',
    on: { fajr: true, sunrise: false, dhuhr: true, asr: true, maghrib: true, isha: true },
    before: 0,
  };
}

let cache: PrayerSettings | null = null;

export async function loadPrayer(): Promise<PrayerSettings> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const d = defaults();
    cache = raw ? { ...d, ...JSON.parse(raw), on: { ...d.on, ...JSON.parse(raw).on } } : d;
  } catch {
    cache = defaults();
  }
  return cache!;
}

export async function savePrayer(next: PrayerSettings) {
  cache = next;
  try { await AsyncStorage.setItem(KEY, JSON.stringify(next)); } catch { /* настройки не обязательны */ }
}

export function timesFor(s: PrayerSettings, day: Date): Record<PrayerKey, Date> | null {
  if (!s.place) return null;
  const c = new Coordinates(s.place.lat, s.place.lng);
  const p = CalculationMethod[s.method]();
  p.madhab = s.madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;
  p.highLatitudeRule = HighLatitudeRule.recommended(c);
  const t = new PrayerTimes(c, day, p);
  return { fajr: t.fajr, sunrise: t.sunrise, dhuhr: t.dhuhr, asr: t.asr, maghrib: t.maghrib, isha: t.isha };
}

/** Следующий намаз (без восхода) и сколько до него осталось */
export function nextPrayer(s: PrayerSettings, now = new Date()): { key: PrayerKey; at: Date } | null {
  for (let d = 0; d < 2; d++) {
    const day = new Date(now); day.setDate(now.getDate() + d);
    const t = timesFor(s, day); if (!t) return null;
    for (const k of FARD) if (t[k] > now) return { key: k, at: t[k] };
  }
  return null;
}

export const qiblaBearing = (p: Place) => Qibla(new Coordinates(p.lat, p.lng));

export const fmtTime = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Местоположение по GPS: нужен только примерный район, город берём у телефона */
export async function locate(): Promise<Place | 'denied' | 'error'> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return 'denied';
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
    let name = 'Моё местоположение';
    try {
      const [g] = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      name = g?.city || g?.subregion || g?.region || name;
    } catch { /* без названия города тоже работает */ }
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, name };
  } catch {
    return 'error';
  }
}

// ---- Уведомления: свой канал для каждого звука, потому что у канала Android звук не меняется ----

const CHANNELS: Record<Sound, { id: string; name: string; sound?: string }> = {
  full: { id: 'prayer-adhan-full', name: 'Азан (полный)', sound: 'adhan_full.mp3' },
  short: { id: 'prayer-adhan-short', name: 'Азан (короткий)', sound: 'adhan_short.mp3' },
  plain: { id: 'prayer-plain', name: 'Намаз: обычный звук' },
};
export const CATEGORY = 'prayer';
export const ACTION_OFF = 'adhan-off';
const DAYS_AHEAD = 7;

async function ensureChannels() {
  if (Platform.OS !== 'android') return;
  for (const ch of Object.values(CHANNELS)) {
    await Notifications.setNotificationChannelAsync(ch.id, {
      name: ch.name,
      // eslint-disable-next-line import/namespace -- значение есть в библиотеке, правило не видит реэкспорт
      importance: Notifications.AndroidImportance.HIGH,
      sound: ch.sound ?? 'default',
      vibrationPattern: [0, 300, 200, 300],
    });
  }
  await Notifications.setNotificationCategoryAsync(CATEGORY, [
    { identifier: ACTION_OFF, buttonTitle: 'Отключить азан', options: { opensAppToForeground: true } },
  ]);
}

async function cancelPrayerNotifications() {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(all.filter((n) => n.identifier.startsWith('prayer-')).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

/** Перепланирует уведомления на неделю вперёд. Вызывается при запуске и после изменения настроек */
export async function schedulePrayers(s: PrayerSettings): Promise<'ok' | 'denied' | 'off'> {
  if (Platform.OS === 'web') return 'off';
  try {
    await cancelPrayerNotifications();
    if (!s.notify || !s.place) return 'off';
    await ensureChannels();
    const perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return 'denied';
    const now = new Date();
    const jobs: Promise<string>[] = [];
    for (let d = 0; d < DAYS_AHEAD; d++) {
      const day = new Date(now); day.setDate(now.getDate() + d);
      const t = timesFor(s, day)!;
      for (const p of PRAYERS) {
        if (!s.on[p.key]) continue;
        const at = t[p.key];
        const stamp = `${day.getFullYear()}${day.getMonth()}${day.getDate()}-${p.key}`;
        if (at > now) {
          const isPrayer = p.key !== 'sunrise';
          jobs.push(Notifications.scheduleNotificationAsync({
            identifier: `prayer-${stamp}`,
            content: {
              title: isPrayer ? `${p.ru} · ${p.ar}` : `Восход · ${p.ar}`,
              body: isPrayer ? `Время намаза ${p.ru} — ${fmtTime(at)}. ${s.place.name}` : `Время фаджра закончилось — ${fmtTime(at)}`,
              categoryIdentifier: isPrayer ? CATEGORY : undefined,
              data: { kind: 'prayer', key: p.key },
            },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: isPrayer ? CHANNELS[s.sound].id : CHANNELS.plain.id },
          }));
        }
        const pre = new Date(at.getTime() - s.before * 60_000);
        if (s.before > 0 && p.key !== 'sunrise' && pre > now) {
          jobs.push(Notifications.scheduleNotificationAsync({
            identifier: `prayer-pre-${stamp}`,
            content: { title: `Скоро ${p.ru}`, body: `Через ${s.before} минут, в ${fmtTime(at)}`, data: { kind: 'prayer-pre', key: p.key } },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: pre, channelId: CHANNELS.plain.id },
          }));
        }
      }
    }
    await Promise.all(jobs);
    return 'ok';
  } catch {
    return 'off';
  }
}

// ---- Отметки прочитанных намазов ----

export type Track = Record<string, PrayerKey[]>;
export const dayStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function loadTrack(): Promise<Track> {
  try { return JSON.parse((await AsyncStorage.getItem(TRACK_KEY)) ?? '{}'); } catch { return {}; }
}
export async function saveTrack(t: Track) {
  // Храним только последние 60 дней
  const keys = Object.keys(t).sort().slice(-60);
  const trimmed = Object.fromEntries(keys.map((k) => [k, t[k]]));
  try { await AsyncStorage.setItem(TRACK_KEY, JSON.stringify(trimmed)); } catch { /* не страшно */ }
}
/** Сколько дней подряд прочитаны все пять намазов (сегодня считается, если уже все пять) */
export function trackStreak(t: Track, now = new Date()): number {
  let n = 0;
  const d = new Date(now);
  if ((t[dayStr(d)]?.length ?? 0) < FARD.length) d.setDate(d.getDate() - 1);
  while ((t[dayStr(d)]?.length ?? 0) >= FARD.length) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
