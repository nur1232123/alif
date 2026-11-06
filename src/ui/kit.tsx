import { router } from 'expo-router';
import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { findArabicVoice, say } from '@/lib/speech';
import { fonts, useColors } from './theme';

const MAX_WIDTH = 560;

export function Screen({ children, footer, testID }: { children: ReactNode; footer?: ReactNode; testID?: string }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }} testID={testID}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingBottom: (footer ? 16 : insets.bottom + 24),
          paddingHorizontal: 20,
          width: '100%',
          maxWidth: MAX_WIDTH,
          alignSelf: 'center',
          gap: 16,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {footer ? (
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: insets.bottom + 16,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: c.line,
            backgroundColor: c.bg,
          }}
        >
          <View style={{ width: '100%', maxWidth: MAX_WIDTH - 40, alignSelf: 'center', gap: 10 }}>{footer}</View>
        </View>
      ) : null}
    </View>
  );
}

export function T({ children, style, tone = 'ink', weight = 'regular', size = 16, testID }: {
  children: ReactNode;
  testID?: string;
  style?: TextStyle;
  tone?: 'ink' | 'muted' | 'accent' | 'good' | 'bad' | 'gold';
  weight?: 'regular' | 'medium' | 'bold';
  size?: number;
}) {
  const c = useColors();
  return (
    <Text testID={testID} style={[{ color: c[tone], fontFamily: fonts[weight], fontSize: size, lineHeight: Math.round(size * 1.4) }, style]}>
      {children}
    </Text>
  );
}

/** Арабский текст: большая высота строки, иначе огласовки обрезаются */
export function Ar({ children, size = 32, style, bold }: { children: ReactNode; size?: number; style?: TextStyle; bold?: boolean }) {
  const c = useColors();
  return (
    <Text
      style={[
        {
          color: c.ink,
          fontFamily: bold ? fonts.arabicBold : fonts.arabic,
          fontSize: size,
          lineHeight: Math.round(size * 1.75),
          writingDirection: 'rtl',
          textAlign: 'center',
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Button({ label, onPress, kind = 'primary', tone, disabled, testID }: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'quiet';
  tone?: 'good' | 'bad';
  disabled?: boolean;
  testID?: string;
}) {
  const c = useColors();
  const primary = kind === 'primary';
  const fill = tone ? c[tone] : c.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => ({
        minHeight: 54,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: primary ? fill : 'transparent',
        borderWidth: primary ? 0 : 2,
        borderBottomWidth: pressed ? 2 : 4,
        borderColor: primary ? c.ink + '33' : c.line,
        opacity: disabled ? 0.4 : 1,
      })}
    >
      <Text style={{ color: primary ? c.onAccent : c.ink, fontFamily: fonts.bold, fontSize: 16, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

export function BackRow({ label = 'Назад' }: { label?: string }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={10}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      style={{ alignSelf: 'flex-start', paddingVertical: 6 }}
      testID="back"
    >
      <Text style={{ color: c.accent, fontFamily: fonts.medium, fontSize: 15 }}>‹ {label}</Text>
    </Pressable>
  );
}

function PlayGlyph({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <View
      style={{
        width: 0,
        height: 0,
        borderTopWidth: size * 0.6,
        borderBottomWidth: size * 0.6,
        borderLeftWidth: size,
        borderTopColor: 'transparent',
        borderBottomColor: 'transparent',
        borderLeftColor: color,
      }}
    />
  );
}

export function ListenButton({ text, label = 'Слушать', testID }: { text: string; label?: string; testID?: string }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => say(text)}
      testID={testID}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        alignSelf: 'center',
        minHeight: 48,
        paddingHorizontal: 20,
        borderRadius: 24,
        backgroundColor: c.soft,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <PlayGlyph color={c.accent} />
      <Text style={{ color: c.ink, fontFamily: fonts.medium, fontSize: 15 }}>{label}</Text>
    </Pressable>
  );
}

export { PlayGlyph };

/** Восьмиконечная звезда зеллиджа: два квадрата, один повёрнут на 45° */
export function Khatam({ size, fill, children }: { size: number; fill: string; children?: ReactNode }) {
  const side = size * 0.72;
  const square: ViewStyle = { position: 'absolute', width: side, height: side, backgroundColor: fill };
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={square} />
      <View style={[square, { transform: [{ rotate: '45deg' }] }]} />
      {children}
    </View>
  );
}

export function ProgressBar({ value, total, thick }: { value: number; total: number; thick?: boolean }) {
  const c = useColors();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: value }}
      style={{ height: thick ? 12 : 6, borderRadius: thick ? 6 : 3, backgroundColor: c.line, overflow: 'hidden' }}
    >
      <View style={{ height: '100%', width: `${(value / total) * 100}%`, backgroundColor: c.accent }} />
    </View>
  );
}

/** Место для дополнительного блока на главной. Заполняет только веб-версия. */
export const slots: { homeFooter: ComponentType | null } = { homeFooter: null };

/** true, если арабского голоса точно нет: тогда вместо звука показываем текст */
export function useVoiceMissing() {
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let alive = true;
    findArabicVoice().then((found) => {
      if (alive) setMissing(found === false);
    });
    return () => {
      alive = false;
    };
  }, []);
  return missing;
}

let noticeSeen = false;

/** Предупреждение показываем один раз, чтобы оно не занимало место в каждом задании */
export function VoiceNotice() {
  const c = useColors();
  const missing = useVoiceMissing();
  const [allowed] = useState(() => !noticeSeen);
  useEffect(() => {
    if (missing) noticeSeen = true;
  }, [missing]);
  if (!missing || !allowed) return null;
  const help = {
    ios: 'Установите его здесь: Настройки > Универсальный доступ > Устный контент > Голоса.',
    android: 'Установите его здесь: Настройки > Синтез речи.',
    web: 'Откройте страницу в Chrome или Edge либо добавьте арабский язык в системе.',
  }[Platform.OS as 'ios' | 'android' | 'web'];
  return (
    <View style={{ backgroundColor: c.goldSoft, borderRadius: 12, padding: 14 }} testID="voice-notice">
      <T size={14} weight="medium">Нет арабского голоса, поэтому звук сейчас не работает. Вместо него показан текст.</T>
      <T size={14} tone="muted">{help}</T>
    </View>
  );
}
