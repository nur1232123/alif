import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ar, BackRow, Button, Screen, T } from '@/ui/kit';
import { useColors } from '@/ui/theme';

// Зикры после намаза: 33 раза «Субхана-Ллах», 33 — «Аль-хамду ли-Ллях», 34 — «Аллаху акбар»
const PHASES = [
  { ar: 'سُبْحَانَ اللَّهِ', tr: 'Субхана-Ллах', ru: 'Пречист Аллах', n: 33 },
  { ar: 'الْحَمْدُ لِلَّهِ', tr: 'Аль-хамду ли-Ллях', ru: 'Хвала Аллаху', n: 33 },
  { ar: 'اللَّهُ أَكْبَرُ', tr: 'Аллаху акбар', ru: 'Аллах велик', n: 34 },
];
const TOTAL = PHASES.reduce((a, p) => a + p.n, 0);

export default function TasbihScreen() {
  const c = useColors();
  const [count, setCount] = useState(0);
  let rest = count, phase = 0;
  while (phase < PHASES.length - 1 && rest >= PHASES[phase].n) { rest -= PHASES[phase].n; phase++; }
  const done = count >= TOTAL;
  const p = PHASES[phase];

  const tap = () => {
    if (done) return;
    const next = count + 1;
    setCount(next);
    // Лёгкий щелчок на каждом счёте, сильнее — когда фраза сменяется или круг завершён
    let r = next, ph = 0;
    while (ph < PHASES.length - 1 && r >= PHASES[ph].n) { r -= PHASES[ph].n; ph++; }
    if (next >= TOTAL) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    else if (r === 0) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  };

  return (
    <Screen testID="tasbih" footer={<Button label="Начать заново" kind="quiet" onPress={() => setCount(0)} testID="tasbih-reset" />}>
      <BackRow />
      <T size={26} weight="bold">Тасбих</T>
      <T tone="muted">Зикры после намаза. Нажимайте на круг.</T>
      <View style={{ alignItems: 'center', gap: 6, marginTop: 8 }}>
        <Ar size={42} bold style={{ color: c.accent }}>{done ? 'مَا شَاءَ اللَّهُ' : p.ar}</Ar>
        <T size={20} weight="bold">{done ? 'Готово! Ма ша Аллах' : p.tr}</T>
        {!done ? <T tone="muted">{p.ru}</T> : null}
      </View>
      <View style={{ alignItems: 'center', marginTop: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Счёт ${done ? TOTAL : rest} из ${p.n}`}
          onPress={tap}
          testID="tasbih-tap"
          style={({ pressed }) => ({
            width: 240, height: 240, borderRadius: 120, alignItems: 'center', justifyContent: 'center',
            backgroundColor: done ? c.good : c.accent, transform: [{ scale: pressed ? 0.95 : 1 }],
            borderWidth: 10, borderColor: done ? c.goodSoft : c.soft,
          })}
        >
          <T size={72} weight="bold" style={{ color: c.onAccent, lineHeight: 84 }} testID="tasbih-count">{done ? TOTAL : rest}</T>
          <T size={16} weight="medium" style={{ color: c.onAccent }}>{done ? 'всего' : `из ${p.n}`}</T>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 8 }}>
        {PHASES.map((x, i) => (
          <View key={x.tr} style={{ width: 60, height: 8, borderRadius: 4, backgroundColor: i < phase || done ? c.good : i === phase ? c.accent : c.line }} />
        ))}
      </View>
      <T tone="muted" style={{ textAlign: 'center' }}>Всего: {count} из {TOTAL}</T>
    </Screen>
  );
}
