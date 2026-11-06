import { Redirect } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { useProgress } from '@/lib/progress';
import { Ar, Button, Khatam, Screen, T } from '@/ui/kit';
import { fonts, useColors } from '@/ui/theme';

const MAX_NAME = 30;

export default function Welcome() {
  const c = useColors();
  const { progress, setName } = useProgress();
  const [value, setValue] = useState(progress.name ?? '');
  const [submitted, setSubmitted] = useState(false);
  const clean = value.trim();

  const submit = () => {
    if (!clean) return;
    setName(clean);
    setSubmitted(true);
  };

  // Переход только после сохранения имени: главный экран закрыт, пока имени нет
  if (submitted && progress.name === clean) return <Redirect href="/" />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen testID="welcome">
        <View style={{ flex: 1, justifyContent: 'center', gap: 24 }}>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Khatam size={132} fill={c.accent}>
              <Ar size={64} bold style={{ color: c.onAccent, lineHeight: 96 }}>ا</Ar>
            </Khatam>
            <T size={30} weight="bold" style={{ lineHeight: 38, marginTop: 12 }}>Алиф</T>
            <T tone="muted" style={{ textAlign: 'center' }}>Арабский с первой буквы</T>
          </View>
          <View style={{ gap: 10 }}>
            <T weight="medium">Как вас зовут?</T>
            <TextInput
              accessibilityLabel="Ваше имя"
              autoCapitalize="words"
              autoComplete="name"
              autoFocus={Platform.OS !== 'web'}
              maxLength={MAX_NAME}
              onChangeText={setValue}
              onSubmitEditing={submit}
              placeholder="Введите имя"
              placeholderTextColor={c.muted}
              returnKeyType="done"
              testID="name-input"
              value={value}
              style={{
                minHeight: 54,
                paddingHorizontal: 16,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: c.line,
                backgroundColor: c.surface,
                color: c.ink,
                fontFamily: fonts.medium,
                fontSize: 18,
              }}
            />
            <Button label="Начать" onPress={submit} disabled={!clean} testID="name-submit" />
            <T size={13} tone="muted" style={{ textAlign: 'center' }}>
              Регистрация не нужна. Имя и успехи хранятся только на этом телефоне.
            </T>
          </View>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
