import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccount } from '@/lib/account';
import { EMPTY, useProgress } from '@/lib/progress';
import { Button, Khatam, T } from '@/ui/kit';
import { fonts, useColors } from '@/ui/theme';

const RESEND_SECONDS = 60;
/** Длина кода из письма: так настроено в Supabase */
const CODE_LENGTH = 8;

const SEND_ERRORS = {
  'bad-email': 'Проверьте адрес почты.',
  'too-many': 'Слишком много писем подряд. Подождите немного и попробуйте снова.',
  offline: 'Нет связи. Проверьте интернет.',
} as const;
const VERIFY_ERRORS = {
  'bad-code': 'Код не подошёл. Проверьте цифры из письма.',
  expired: 'Код устарел. Отправьте новый.',
  offline: 'Нет связи. Проверьте интернет.',
} as const;

/** Вход по почте: код из письма, без пароля. Здесь же выход и удаление аккаунта */
export default function AccountScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { user, synced, sendCode, verifyCode, signOut, deleteAccount } = useAccount();
  const { progress, replaceProgress } = useProgress();
  // Пришли с экрана подписки: после входа возвращаемся к оплате
  const { next } = useLocalSearchParams<{ next?: string }>();
  const toPremium = next === 'premium';
  const [step, setStep] = useState<'email' | 'code' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Обратный отсчёт до повторной отправки кода
  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const close = () => {
    if (!progress.name) router.replace('/welcome');
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const requestCode = async () => {
    setBusy(true);
    setError(null);
    const result = await sendCode(email);
    setBusy(false);
    if (result === 'sent') {
      setStep('code');
      setCode('');
      setWait(RESEND_SECONDS);
    } else setError(SEND_ERRORS[result]);
  };

  const enter = async (value = code) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await verifyCode(email, value);
    setBusy(false);
    if (result === 'ok') setStep('done');
    else setError(VERIFY_ERRORS[result]);
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    const ok = await deleteAccount();
    setBusy(false);
    if (!ok) {
      setError('Не получилось удалить аккаунт. Проверьте интернет и попробуйте ещё раз.');
      return;
    }
    // Вместе с аккаунтом стираем и прогресс на телефоне
    replaceProgress(EMPTY);
    router.replace('/welcome');
  };

  const input = {
    minHeight: 54,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.line,
    backgroundColor: c.surface,
    color: c.ink,
    fontFamily: fonts.medium,
    fontSize: 18,
  } as const;

  const syncText = { idle: '', saving: 'Сохраняю…', saved: 'Прогресс сохранён в аккаунте', error: 'Не удалось сохранить. Попробую снова, когда будет интернет' }[synced];

  let body;
  if (user && step !== 'done') {
    body = (
      <View style={{ gap: 14 }} testID="account-signed-in">
        <View style={{ padding: 16, borderRadius: 18, backgroundColor: c.goodSoft, gap: 4 }}>
          <T weight="bold" tone="good">Вы вошли</T>
          <T testID="account-email">{user.email}</T>
          {syncText ? <T size={13} tone="muted" testID="account-sync">{syncText}</T> : null}
        </View>
        <T tone="muted" size={14} style={{ lineHeight: 21 }}>
          Прогресс и подписка сохраняются в аккаунте. На новом телефоне или после переустановки войдите с этой же почтой.
        </T>
        <Button label="Выйти" kind="quiet" onPress={async () => { await signOut(); close(); }} testID="sign-out" />
        {!confirmDelete ? (
          <Pressable accessibilityRole="button" onPress={() => setConfirmDelete(true)} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }} testID="delete-account">
            <T size={14} tone="bad">Удалить аккаунт</T>
          </Pressable>
        ) : (
          <View style={{ gap: 10, padding: 14, borderRadius: 16, backgroundColor: c.badSoft }} testID="delete-confirm">
            <T weight="bold">Удалить аккаунт и весь прогресс?</T>
            <T size={14} tone="muted">Это нельзя отменить. Подписку в магазине отмените отдельно, в настройках Google Play или Apple ID.</T>
            {busy ? <ActivityIndicator color={c.bad} /> : <Button label="Да, удалить" tone="bad" onPress={remove} testID="delete-yes" />}
            <Button label="Отмена" kind="quiet" onPress={() => setConfirmDelete(false)} testID="delete-no" />
          </View>
        )}
      </View>
    );
  } else if (step === 'done') {
    body = (
      <View style={{ gap: 14, alignItems: 'center' }} testID="account-done">
        <Khatam size={84} fill={c.good}>
          <T size={30} weight="bold" style={{ color: c.onAccent, lineHeight: 36 }}>✓</T>
        </Khatam>
        <T size={22} weight="bold" style={{ textAlign: 'center' }}>Готово!</T>
        <T tone="muted" style={{ textAlign: 'center', lineHeight: 22 }}>
          {progress.name ? `Прогресс сохранён, ${progress.name}. Теперь он не потеряется.` : 'Вы вошли. Осталось написать, как вас зовут.'}
        </T>
        <Button
          label={toPremium ? 'К оплате' : 'Продолжить'}
          onPress={() => router.replace(toPremium && progress.name ? '/premium' : progress.name ? '/' : '/welcome')}
          testID="account-continue"
        />
      </View>
    );
  } else if (step === 'email') {
    body = (
      <View style={{ gap: 12 }}>
        <T weight="medium">Ваша почта</T>
        <TextInput
          accessibilityLabel="Почта"
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          keyboardType="email-address"
          onChangeText={setEmail}
          onSubmitEditing={requestCode}
          placeholder="name@mail.com"
          placeholderTextColor={c.muted}
          returnKeyType="send"
          value={email}
          testID="email-input"
          style={input}
        />
        {busy ? <ActivityIndicator color={c.accent} style={{ height: 52 }} /> : <Button label="Получить код" onPress={requestCode} disabled={!email.trim()} testID="send-code" />}
        <T size={13} tone="muted" style={{ textAlign: 'center' }}>Пришлём код на почту. Пароль не нужен.</T>
      </View>
    );
  } else {
    body = (
      <View style={{ gap: 12 }}>
        <T style={{ lineHeight: 23 }}>
          Код отправлен на <T weight="bold">{email.trim()}</T>. Если письма нет, проверьте папку «Спам».
        </T>
        <TextInput
          accessibilityLabel="Код из письма"
          autoComplete="one-time-code"
          keyboardType="number-pad"
          maxLength={CODE_LENGTH}
          onChangeText={(v) => {
            const digits = v.replace(/\D/g, '').slice(0, CODE_LENGTH);
            setCode(digits);
            // Набрал все цифры: входим сразу, без кнопки
            if (digits.length === CODE_LENGTH) enter(digits);
          }}
          onSubmitEditing={() => enter()}
          placeholder={'—'.repeat(CODE_LENGTH)}
          placeholderTextColor={c.muted}
          textContentType="oneTimeCode"
          value={code}
          testID="code-input"
          style={[input, { fontSize: 24, letterSpacing: 6, textAlign: 'center' }]}
        />
        {busy ? <ActivityIndicator color={c.accent} style={{ height: 52 }} /> : <Button label="Войти" onPress={() => enter()} disabled={code.length < CODE_LENGTH} testID="verify-code" />}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <Pressable accessibilityRole="button" onPress={() => { setStep('email'); setError(null); }} hitSlop={8} testID="change-email">
            <T size={14} tone="accent">Другая почта</T>
          </Pressable>
          <Pressable accessibilityRole="button" disabled={wait > 0 || busy} onPress={requestCode} hitSlop={8} testID="resend-code">
            <T size={14} tone={wait > 0 ? 'muted' : 'accent'}>{wait > 0 ? `Отправить снова через ${wait} с` : 'Отправить код снова'}</T>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} testID="account">
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 24, gap: 20, width: '100%', maxWidth: 480, alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" accessibilityLabel="Закрыть" hitSlop={12} onPress={close} testID="close" style={{ alignSelf: 'flex-start' }}>
          <T size={22} weight="bold" tone="muted">✕</T>
        </Pressable>
        <View style={{ gap: 6 }}>
          <T size={26} weight="bold" style={{ lineHeight: 32 }}>{user && step !== 'done' ? 'Аккаунт' : 'Сохранить прогресс'}</T>
          {!user ? (
            <T tone="muted" style={{ lineHeight: 22 }}>
              {toPremium
                ? 'Сначала войдите по почте: подписка привяжется к ней и не потеряется, даже если сменить телефон.'
                : 'Войдите по почте, и прогресс с подпиской не потеряются при переустановке. Можно продолжить и на другом телефоне.'}
            </T>
          ) : null}
        </View>
        {body}
        {error ? <T size={14} tone="bad" testID="account-error">{error}</T> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
