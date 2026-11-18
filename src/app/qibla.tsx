import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { loadPrayer, qiblaBearing, type Place } from '@/lib/prayer';
import { BackRow, Screen, T } from '@/ui/kit';
import { useColors } from '@/ui/theme';

const SIZE = 280;

/** Кибла: стрелка на Мекку по компасу телефона, без компаса — угол от севера */
export default function QiblaScreen() {
  const c = useColors();
  const [place, setPlace] = useState<Place | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [noCompass, setNoCompass] = useState(Platform.OS === 'web');
  const aligned = useRef(false);

  useEffect(() => {
    loadPrayer().then((s) => setPlace(s.place));
    if (Platform.OS === 'web') return;
    let sub: { remove: () => void } | null = null;
    let alive = true;
    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!perm.granted) { setNoCompass(true); return; }
        const s = await Location.watchHeadingAsync((h) => {
          const v = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
          if (alive) setHeading(v);
        });
        if (alive) sub = s; else s.remove();
      } catch {
        setNoCompass(true);
      }
    })();
    return () => { alive = false; sub?.remove(); };
  }, []);

  const qibla = place ? qiblaBearing(place) : null;
  const diff = qibla !== null && heading !== null ? ((qibla - heading + 540) % 360) - 180 : null;
  const ok = diff !== null && Math.abs(diff) < 5;

  useEffect(() => {
    if (ok && !aligned.current) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    aligned.current = ok;
  }, [ok]);

  return (
    <Screen testID="qibla">
      <BackRow />
      <T size={26} weight="bold">Кибла</T>
      {!place ? (
        <T tone="muted">Сначала выберите город во вкладке «Намаз».</T>
      ) : (
        <>
          <T tone="muted" style={{ lineHeight: 22 }}>
            {noCompass || heading === null
              ? `Направление на Мекку из «${place.name}»: ${Math.round(qibla!)}° от севера по часовой стрелке.`
              : 'Положите телефон ровно и поворачивайтесь, пока стрелка не станет зелёной.'}
          </T>
          <View style={{ alignItems: 'center', marginTop: 16 }}>
            <View
              style={{
                width: SIZE, height: SIZE, borderRadius: SIZE / 2, borderWidth: 3, borderColor: ok ? c.good : c.line, backgroundColor: c.surface,
                alignItems: 'center', justifyContent: 'center', transform: [{ rotate: `${-(heading ?? 0)}deg` }],
              }}
            >
              {/* Стороны света */}
              {[['С', 0], ['В', 90], ['Ю', 180], ['З', 270]].map(([l, a]) => (
                <View key={l as string} style={{ position: 'absolute', width: SIZE, height: SIZE, alignItems: 'center', transform: [{ rotate: `${a}deg` }] }}>
                  <T size={18} weight="bold" tone={l === 'С' ? 'bad' : 'muted'} style={{ marginTop: 8, transform: [{ rotate: `${-(a as number) + (heading ?? 0)}deg` }] }}>{l as string}</T>
                </View>
              ))}
              {/* Стрелка на Каабу */}
              {qibla !== null ? (
                <View style={{ position: 'absolute', width: SIZE, height: SIZE, alignItems: 'center', transform: [{ rotate: `${qibla}deg` }] }}>
                  <View style={{ marginTop: 36, alignItems: 'center' }}>
                    <T size={34} style={{ lineHeight: 42 }}>🕋</T>
                    <View style={{ width: 8, height: SIZE / 2 - 80, borderRadius: 4, backgroundColor: ok ? c.good : c.accent }} />
                  </View>
                </View>
              ) : null}
              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: c.ink }} />
            </View>
          </View>
          <T size={22} weight="bold" tone={ok ? 'good' : 'ink'} style={{ textAlign: 'center', marginTop: 12 }} testID="qibla-deg">
            {ok ? 'Вы смотрите на киблу' : `${Math.round(qibla!)}° от севера`}
          </T>
          {!noCompass && heading === null ? <T tone="muted" style={{ textAlign: 'center' }}>Включаю компас…</T> : null}
          <T size={13} tone="muted" style={{ textAlign: 'center', lineHeight: 19 }}>
            Компас телефона может ошибаться рядом с металлом и магнитами. Если стрелка скачет, проведите телефоном восьмёркой.
          </T>
        </>
      )}
    </Screen>
  );
}
