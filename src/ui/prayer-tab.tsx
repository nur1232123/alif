import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { FlatList, Linking, Modal, Platform, Pressable, ScrollView, Switch, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fmtHijri, HIJRI_MONTHS_AR, toHijri } from '@/lib/hijri';
import {
  dayStr, FARD, fmtTime, loadPrayer, loadTrack, locate, METHODS, nextPrayer, PRAYERS, savePrayer, saveTrack, schedulePrayers, timesFor, trackStreak,
  type MethodId, type Place, type PrayerKey, type PrayerSettings, type Sound, type Track,
} from '@/lib/prayer';
import { Fox } from './fox';
import { Appear, Ar, Button, T } from './kit';
import { fonts, useColors } from './theme';

// Города для ручного выбора, если GPS выключен
const CITIES: Place[] = [
  ['Москва', 55.7558, 37.6173], ['Санкт-Петербург', 59.9311, 30.3609], ['Казань', 55.7963, 49.1088], ['Уфа', 54.7388, 55.9721],
  ['Махачкала', 42.9849, 47.5047], ['Дербент', 42.0577, 48.2887], ['Грозный', 43.3178, 45.6949], ['Нальчик', 43.4853, 43.6071],
  ['Черкесск', 44.2269, 42.0469], ['Магас', 43.1667, 44.8], ['Екатеринбург', 56.8389, 60.6057], ['Новосибирск', 55.0084, 82.9357],
  ['Нижний Новгород', 56.2965, 43.9361], ['Самара', 53.1959, 50.1002], ['Ростов-на-Дону', 47.2357, 39.7015], ['Краснодар', 45.0355, 38.9753],
  ['Челябинск', 55.1644, 61.4368], ['Тюмень', 57.153, 65.5343], ['Астрахань', 46.3479, 48.0336], ['Оренбург', 51.7682, 55.097],
  ['Алматы', 43.2389, 76.8897], ['Астана', 51.1694, 71.4491], ['Шымкент', 42.3417, 69.5901], ['Бишкек', 42.8746, 74.5698],
  ['Ош', 40.5283, 72.7985], ['Ташкент', 41.2995, 69.2401], ['Самарканд', 39.627, 66.975], ['Бухара', 39.7747, 64.4286],
  ['Наманган', 40.9983, 71.6726], ['Андижан', 40.7821, 72.3442], ['Душанбе', 38.5598, 68.787], ['Худжанд', 40.2833, 69.6333],
  ['Ашхабад', 37.9601, 58.3261], ['Баку', 40.4093, 49.8671], ['Тбилиси', 41.7151, 44.8271], ['Минск', 53.9006, 27.559],
  ['Киев', 50.4501, 30.5234], ['Стамбул', 41.0082, 28.9784], ['Анкара', 39.9334, 32.8597], ['Дубай', 25.2048, 55.2708],
  ['Абу-Даби', 24.4539, 54.3773], ['Шарджа', 25.3463, 55.4209], ['Эр-Рияд', 24.7136, 46.6753], ['Джидда', 21.4858, 39.1925],
  ['Мекка', 21.3891, 39.8579], ['Медина', 24.5247, 39.5692], ['Доха', 25.2854, 51.531], ['Эль-Кувейт', 29.3759, 47.9774],
  ['Манама', 26.2285, 50.586], ['Маскат', 23.588, 58.3829], ['Амман', 31.9454, 35.9284], ['Каир', 30.0444, 31.2357],
  ['Бейрут', 33.8938, 35.5018], ['Дамаск', 33.5138, 36.2765], ['Багдад', 33.3152, 44.3661], ['Лондон', 51.5074, -0.1278],
  ['Берлин', 52.52, 13.405], ['Париж', 48.8566, 2.3522], ['Нью-Йорк', 40.7128, -74.006],
].map(([name, lat, lng]) => ({ name: name as string, lat: lat as number, lng: lng as number }));

const SOUNDS: { id: Sound; label: string }[] = [
  { id: 'full', label: 'Полный азан' },
  { id: 'short', label: 'Короткий азан' },
  { id: 'plain', label: 'Обычный звук' },
];
const BEFORE = [0, 10, 15, 30];

function left(ms: number) {
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60);
  return h ? `${h} ч ${m % 60} мин` : `${m} мин`;
}

/** Вкладка «Намаз»: время намазов, напоминания с азаном, отметки, кибла, тасбих и слова намаза */
export function PrayerTab({ notice }: { notice?: string | null }) {
  const c = useColors();
  const [s, setS] = useState<PrayerSettings | null>(null);
  const [track, setTrack] = useState<Track>({});
  const [now, setNow] = useState(() => new Date());
  const [picker, setPicker] = useState<'city' | 'method' | null>(null);
  const [msg, setMsg] = useState<string | null>(notice ?? null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadPrayer().then(setS);
    loadTrack().then(setTrack);
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const update = useCallback(async (patch: Partial<PrayerSettings>) => {
    const base = s ?? (await loadPrayer());
    const next = { ...base, ...patch };
    setS(next);
    await savePrayer(next);
    if (next.notify) {
      const r = await schedulePrayers(next);
      if (r === 'denied') {
        setMsg('Телефон не разрешил уведомления. Включите их для «Алиф» в настройках телефона.');
        const off = { ...next, notify: false };
        setS(off); await savePrayer(off);
      }
    } else {
      await schedulePrayers(next);
    }
  }, [s]);

  const gps = async () => {
    setBusy(true);
    const r = await locate();
    setBusy(false);
    if (r === 'denied') setMsg('Нет доступа к местоположению. Выберите город из списка.');
    else if (r === 'error') setMsg('Не получилось определить место. Выберите город из списка.');
    else { await update({ place: r }); setMsg(null); }
  };

  const toggleDone = async (k: PrayerKey) => {
    const day = dayStr(now);
    const list = new Set(track[day] ?? []);
    if (list.has(k)) list.delete(k); else list.add(k);
    const next = { ...track, [day]: FARD.filter((x) => list.has(x)) };
    setTrack(next);
    await saveTrack(next);
  };

  const times = useMemo(() => (s ? timesFor(s, now) : null), [s, now]);
  const next = useMemo(() => (s ? nextPrayer(s, now) : null), [s, now]);
  const hijri = toHijri(now);
  const ramadan = hijri.month === 9;

  if (!s) return null;

  const card = { backgroundColor: c.surface, borderRadius: 20, borderWidth: 1, borderColor: c.line, padding: 16, gap: 12 } as const;
  const chip = (on: boolean) => ({ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: on ? 2 : 1, borderColor: on ? c.accent : c.line, backgroundColor: on ? c.soft : c.surface });

  // Ещё не выбран город
  if (!s.place) {
    return (
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Fox pose="think" size={130} />
          <T size={22} weight="bold" style={{ textAlign: 'center' }}>Время намаза</T>
          <T tone="muted" style={{ textAlign: 'center', lineHeight: 22 }}>
            Чтобы рассчитать время намазов и направление киблы, нужно знать, где вы. Место остаётся только на этом телефоне.
          </T>
        </View>
        {msg ? <T tone="bad" style={{ textAlign: 'center' }}>{msg}</T> : null}
        {Platform.OS !== 'web' ? <Button label={busy ? 'Определяю…' : 'Определить по GPS'} onPress={gps} disabled={busy} testID="prayer-gps" /> : null}
        <Button label="Выбрать город" kind="quiet" onPress={() => setPicker('city')} testID="prayer-city" />
        <CityPicker visible={picker === 'city'} onClose={() => setPicker(null)} onPick={(p) => { setPicker(null); update({ place: p }); }} />
      </ScrollView>
    );
  }

  const doneToday = new Set(track[dayStr(now)] ?? []);
  const streak = trackStreak(track, now);

  return (
    <ScrollView contentContainerStyle={{ padding: 20, gap: 16, maxWidth: 560, width: '100%', alignSelf: 'center' }} testID="prayer-tab">
      {/* Место и дата */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Pressable accessibilityRole="button" onPress={() => setPicker('city')} style={{ flexShrink: 1 }} testID="prayer-place">
          <T size={20} weight="bold" lines={1}>📍 {s.place.name}</T>
          <T size={13} tone="accent" weight="bold">Изменить</T>
        </Pressable>
        <View style={{ alignItems: 'flex-end' }}>
          <Ar size={20} bold style={{ color: c.gold }}>{`${hijri.day} ${HIJRI_MONTHS_AR[hijri.month - 1]} ${hijri.year}`}</Ar>
          <T size={13} tone="muted">{fmtHijri(hijri)} г. х.</T>
        </View>
      </View>
      {msg ? <T tone="accent" weight="medium" style={{ lineHeight: 21 }} testID="prayer-msg">{msg}</T> : null}

      {/* Следующий намаз */}
      {next ? (
        <Appear>
          <View style={{ borderRadius: 24, padding: 20, backgroundColor: c.accent, flexDirection: 'row', alignItems: 'center', gap: 12 }} testID="prayer-next">
            <View style={{ flex: 1 }}>
              <T size={14} weight="medium" style={{ color: c.onAccent, opacity: 0.85 }}>Следующий намаз</T>
              <T size={26} weight="bold" style={{ color: c.onAccent, lineHeight: 32 }}>{PRAYERS.find((p) => p.key === next.key)!.ru}</T>
              <T size={40} weight="bold" style={{ color: c.onAccent, lineHeight: 48, fontVariant: ['tabular-nums'] }}>{fmtTime(next.at)}</T>
              <T size={16} weight="medium" style={{ color: c.onAccent }}>через {left(next.at.getTime() - now.getTime())}</T>
            </View>
            <Ar size={34} bold style={{ color: c.onAccent }}>{PRAYERS.find((p) => p.key === next.key)!.ar}</Ar>
          </View>
        </Appear>
      ) : null}

      {/* Рамадан */}
      {ramadan && times ? (
        <View style={[card, { backgroundColor: c.goldSoft, borderColor: c.gold }]} testID="ramadan">
          <T size={18} weight="bold">🌙 Рамадан мубарак!</T>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}><T tone="muted" size={14}>Сухур до</T><T size={24} weight="bold">{fmtTime(times.fajr)}</T></View>
            <View style={{ flex: 1 }}><T tone="muted" size={14}>Ифтар в</T><T size={24} weight="bold">{fmtTime(times.maghrib)}</T></View>
          </View>
        </View>
      ) : null}

      {/* Время на сегодня и отметки */}
      {times ? (
        <View style={card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <T size={17} weight="bold">Сегодня</T>
            <T size={14} tone="muted" testID="prayer-count">Прочитано {doneToday.size} из 5{streak ? ` · 🔥 ${streak}` : ''}</T>
          </View>
          {PRAYERS.map((p) => {
            const isNext = next?.key === p.key;
            const fard = p.key !== 'sunrise';
            const started = times[p.key] <= now;
            const done = doneToday.has(p.key);
            return (
              <View key={p.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 14, backgroundColor: isNext ? c.soft : 'transparent' }}>
                {fard ? (
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: done, disabled: !started }}
                    accessibilityLabel={`${p.ru} прочитан`}
                    disabled={!started}
                    onPress={() => toggleDone(p.key)}
                    hitSlop={8}
                    testID={`prayer-done-${p.key}`}
                    style={{ width: 28, height: 28, borderRadius: 9, borderWidth: 2, borderColor: done ? c.good : c.line, backgroundColor: done ? c.good : 'transparent', alignItems: 'center', justifyContent: 'center', opacity: started ? 1 : 0.35 }}
                  >
                    {done ? <T size={16} weight="bold" style={{ color: '#fff', lineHeight: 20 }}>✓</T> : null}
                  </Pressable>
                ) : <View style={{ width: 28, alignItems: 'center' }}><T size={18}>☀️</T></View>}
                <View style={{ flex: 1 }}>
                  <T size={17} weight={isNext ? 'bold' : 'medium'} tone={fard ? 'ink' : 'muted'}>{p.ru}</T>
                </View>
                <Ar size={18} style={{ color: c.muted }}>{p.ar}</Ar>
                <T size={18} weight="bold" style={{ fontVariant: ['tabular-nums'], minWidth: 56, textAlign: 'right' }} testID={`prayer-time-${p.key}`}>{fmtTime(times[p.key])}</T>
                {s.notify ? (
                  <Pressable accessibilityRole="switch" accessibilityState={{ checked: s.on[p.key] }} accessibilityLabel={`Напоминание ${p.ru}`} hitSlop={8} onPress={() => update({ on: { ...s.on, [p.key]: !s.on[p.key] } })} testID={`prayer-bell-${p.key}`}>
                    <T size={18} style={{ opacity: s.on[p.key] ? 1 : 0.3 }}>{s.on[p.key] ? '🔔' : '🔕'}</T>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Разделы */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {[['🧭', 'Кибла', '/qibla', 'prayer-qibla'], ['📿', 'Тасбих', '/tasbih', 'prayer-tasbih'], ['🕌', 'Учим намаз', '/namaz', 'prayer-learn']].map(([icon, label, href, id]) => (
          <Pressable key={href} accessibilityRole="button" onPress={() => router.push(href)} testID={id}
            style={({ pressed }) => [card, { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 14, transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
            <T size={28} style={{ lineHeight: 36 }}>{icon}</T>
            <T size={14} weight="bold" style={{ textAlign: 'center' }}>{label}</T>
          </Pressable>
        ))}
      </View>

      {/* Уведомления */}
      <View style={card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <T size={17} weight="bold">Азан в уведомлении</T>
            <T size={14} tone="muted">Напомню о каждом намазе. В уведомлении есть кнопка «Отключить азан».</T>
          </View>
          <Switch value={s.notify} onValueChange={(v) => update({ notify: v })} trackColor={{ true: c.accent, false: c.line }} testID="prayer-notify" />
        </View>
        {s.notify ? (
          <>
            <T size={14} weight="medium">Звук</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {SOUNDS.map((o) => (
                <Pressable key={o.id} accessibilityRole="radio" accessibilityState={{ selected: s.sound === o.id }} onPress={() => update({ sound: o.id })} style={chip(s.sound === o.id)} testID={`prayer-sound-${o.id}`}>
                  <T size={14} weight={s.sound === o.id ? 'bold' : 'regular'}>{o.label}</T>
                </Pressable>
              ))}
            </View>
            <T size={14} weight="medium">Предупредить заранее</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {BEFORE.map((m) => (
                <Pressable key={m} accessibilityRole="radio" accessibilityState={{ selected: s.before === m }} onPress={() => update({ before: m })} style={chip(s.before === m)} testID={`prayer-before-${m}`}>
                  <T size={14} weight={s.before === m ? 'bold' : 'regular'}>{m ? `за ${m} мин` : 'Нет'}</T>
                </Pressable>
              ))}
            </View>
            {Platform.OS === 'android' ? (
              <Pressable accessibilityRole="button" onPress={() => Linking.openSettings()} testID="prayer-exact">
                <T size={13} tone="muted" style={{ lineHeight: 19 }}>Если уведомления приходят с опозданием, разрешите «Будильники и напоминания» для «Алиф» в настройках телефона. <T size={13} tone="accent" weight="bold">Открыть настройки</T></T>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </View>

      {/* Расчёт */}
      <View style={card}>
        <T size={17} weight="bold">Расчёт времени</T>
        <Pressable accessibilityRole="button" onPress={() => setPicker('method')} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }} testID="prayer-method">
          <T size={15} tone="muted">Метод</T>
          <T size={15} weight="bold" tone="accent">{METHODS.find((m) => m.id === s.method)?.ru} ›</T>
        </Pressable>
        <T size={15} tone="muted">Время асра</T>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {([['shafi', 'Стандартное (шафиитский и др.)'], ['hanafi', 'Ханафитский']] as const).map(([id, label]) => (
            <Pressable key={id} accessibilityRole="radio" accessibilityState={{ selected: s.madhab === id }} onPress={() => update({ madhab: id })} style={chip(s.madhab === id)} testID={`prayer-madhab-${id}`}>
              <T size={14} weight={s.madhab === id ? 'bold' : 'regular'}>{label}</T>
            </Pressable>
          ))}
        </View>
        <T size={13} tone="muted" style={{ lineHeight: 19 }}>
          Время рассчитано по формуле и может на несколько минут отличаться от расписания вашей мечети. Дата по хиджре может расходиться на день.
        </T>
      </View>
      <T size={12} tone="muted" style={{ textAlign: 'center', lineHeight: 18 }}>
        Азан: Aaqib Azeez, запись Atcovi, Wikimedia Commons, лицензия CC BY-SA 4.0
      </T>

      <CityPicker visible={picker === 'city'} onClose={() => setPicker(null)} onGps={Platform.OS !== 'web' ? async () => { setPicker(null); await gps(); } : undefined} onPick={(p) => { setPicker(null); update({ place: p }); }} />
      <ListPicker visible={picker === 'method'} title="Метод расчёта" items={METHODS.map((m) => ({ id: m.id, label: m.ru }))} selected={s.method}
        onClose={() => setPicker(null)} onPick={(id) => { setPicker(null); update({ method: id as MethodId }); }} />
    </ScrollView>
  );
}

function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,.35)' }} onPress={onClose} accessibilityLabel="Закрыть" />
      <View style={{ maxHeight: '80%', backgroundColor: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: insets.bottom + 16, gap: 12 }}>
        <T size={20} weight="bold">{title}</T>
        {children}
      </View>
    </Modal>
  );
}

function CityPicker({ visible, onClose, onPick, onGps }: { visible: boolean; onClose: () => void; onPick: (p: Place) => void; onGps?: () => void }) {
  const c = useColors();
  const [q, setQ] = useState('');
  const list = CITIES.filter((x) => x.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Sheet visible={visible} onClose={onClose} title="Где вы?">
      {onGps ? <Button label="📍 Определить по GPS" onPress={onGps} testID="city-gps" /> : null}
      <TextInput
        value={q} onChangeText={setQ} placeholder="Поиск города" placeholderTextColor={c.muted} testID="city-search"
        style={{ minHeight: 48, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, color: c.ink, fontFamily: fonts.medium, fontSize: 16 }}
      />
      <FlatList
        data={list} keyExtractor={(x) => x.name} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }}
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => onPick(item)} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line }} testID={`city-${item.name}`}>
            <T size={16}>{item.name}</T>
          </Pressable>
        )}
        ListEmptyComponent={<T tone="muted">Такого города нет в списке. Выберите ближайший крупный город или определите место по GPS.</T>}
      />
    </Sheet>
  );
}

function ListPicker({ visible, title, items, selected, onClose, onPick }: { visible: boolean; title: string; items: { id: string; label: string }[]; selected: string; onClose: () => void; onPick: (id: string) => void }) {
  const c = useColors();
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <ScrollView style={{ flexGrow: 0 }}>
        {items.map((it) => (
          <Pressable key={it.id} accessibilityRole="radio" accessibilityState={{ selected: it.id === selected }} onPress={() => onPick(it.id)} style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line, flexDirection: 'row', justifyContent: 'space-between' }} testID={`method-${it.id}`}>
            <T size={16} weight={it.id === selected ? 'bold' : 'regular'}>{it.label}</T>
            {it.id === selected ? <T tone="accent" weight="bold">✓</T> : null}
          </Pressable>
        ))}
      </ScrollView>
    </Sheet>
  );
}
