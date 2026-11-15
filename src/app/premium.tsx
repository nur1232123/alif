import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { STAGES } from '@/data/course';
import { FREE_STAGES, FREE_TUTOR_PER_DAY, type PlanId, usePremium } from '@/lib/premium';
import { PROMO_ERRORS, redeemPromo } from '@/lib/promo';
import { russianDate } from './subscription';
import { Button, Khatam, T } from '@/ui/kit';
import { fonts, useColors } from '@/ui/theme';

const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL || 'https://alif.best/terms.html';
const PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL || 'https://alif.best/privacy.html';
const STORE_NAME = Platform.OS === 'ios' ? 'Apple ID' : 'Google Play';
// Оплата на сайте идёт через Paddle: он присылает чек и ссылку для отмены подписки на почту
const WEB_PAYER = 'Paddle';

const paidWeeks = STAGES.filter((s) => s.id > FREE_STAGES).reduce((sum, s) => sum + s.weeks.length, 0);

/** Экран подписки «Алиф Премиум» */
export default function PremiumScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { isPremium, plans, purchase, restore, billing } = usePremium();
  const web = billing === 'web';
  // Страница оплаты открыта в браузере: ждём, пока ученик вернётся
  const [waiting, setWaiting] = useState(false);
  const [chosen, setChosen] = useState<PlanId>('annual');
  const [busy, setBusy] = useState<'buy' | 'restore' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const plan = plans.find((p) => p.id === chosen) ?? plans[0];
  // Промокод: поле раскрывается по нажатию «Есть промокод?»
  const [promoOpen, setPromoOpen] = useState(false);
  const [promo, setPromo] = useState('');
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoNote, setPromoNote] = useState<{ ok: boolean; text: string } | null>(null);

  const applyPromo = async () => {
    if (!promo.trim() || promoBusy) return;
    setPromoBusy(true);
    setPromoNote(null);
    const result = await redeemPromo(promo);
    if (result.ok) {
      await restore();
      setPromoNote({ ok: true, text: result.endsAt ? `Готово! Премиум включён до ${russianDate(result.endsAt)}.` : 'Готово! Премиум включён навсегда.' });
    } else if (result.reason === 'need-login') {
      router.push('/account?next=premium');
    } else setPromoNote({ ok: false, text: PROMO_ERRORS[result.reason] });
    setPromoBusy(false);
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const buy = async () => {
    setBusy('buy');
    setNote(null);
    const result = await purchase(plan.id);
    setBusy(null);
    if (result === 'ok') close();
    else if (result === 'need-login') router.push('/account?next=premium');
    else if (result === 'pending') setWaiting(true);
    else if (result === 'unavailable') setNote('Оплата пока не подключена. Скоро здесь можно будет оформить подписку.');
    else if (result === 'error') setNote('Не получилось оформить подписку. Деньги не списаны. Попробуйте ещё раз.');
  };

  const onRestore = async () => {
    setBusy('restore');
    setNote(null);
    const ok = await restore();
    setBusy(null);
    if (ok) close();
    else setNote(web ? 'Оплата пока не найдена. Если вы только что оплатили, подождите минуту и проверьте снова.' : 'Активная подписка не найдена.');
  };

  const benefits = [
    `Все 5 этапов: ещё ${paidWeeks} недель слов, чтения и разговоров`,
    `ИИ-учитель без ограничений (бесплатно ${FREE_TUTOR_PER_DAY} вопроса в день)`,
    'Голосовые задания и экзамены во всех уроках',
    'Тексты и диалоги с озвучкой',
  ];

  const cta = plan.trial ? `Попробовать ${plan.trial} бесплатно` : 'Оформить подписку';
  const after = plan.id === 'annual' ? `${plan.price} в год` : `${plan.price} в месяц`;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }} testID="premium">
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 24, gap: 18, width: '100%', maxWidth: 520, alignSelf: 'center' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Закрыть" hitSlop={12} onPress={close} testID="close" style={{ alignSelf: 'flex-start' }}>
          <T size={22} weight="bold" tone="muted">✕</T>
        </Pressable>

        <View style={{ alignItems: 'center', gap: 10 }}>
          <Khatam size={84} fill={c.gold}>
            <T size={30} weight="bold" style={{ color: c.onAccent, lineHeight: 36 }}>★</T>
          </Khatam>
          <T size={26} weight="bold" style={{ lineHeight: 32, textAlign: 'center' }}>Алиф Премиум</T>
          <T tone="muted" style={{ textAlign: 'center', lineHeight: 22 }}>
            Алфавит и чтение всегда бесплатны. Премиум открывает весь курс до свободного разговора.
          </T>
        </View>

        {waiting && !isPremium ? (
          <View style={{ gap: 6, padding: 14, borderRadius: 16, backgroundColor: c.soft }} testID="premium-waiting">
            <T weight="bold">Страница оплаты открыта в браузере</T>
            <T size={14} tone="muted" style={{ lineHeight: 20 }}>
              После оплаты вернитесь в приложение, Премиум включится сам. Если не включился, нажмите «Проверить оплату».
            </T>
          </View>
        ) : null}
        {isPremium ? (
          <View style={{ padding: 16, borderRadius: 18, backgroundColor: c.goodSoft, gap: 4 }} testID="premium-active">
            <T weight="bold" tone="good">Премиум уже активен</T>
            <T size={14} tone="muted">
              Все этапы и ИИ-учитель открыты. {web ? 'Отменить подписку можно по ссылке в письме от Paddle.' : `Управлять подпиской можно в ${STORE_NAME}.`}
            </T>
          </View>
        ) : null}

        <View style={{ gap: 10 }}>
          {benefits.map((b) => (
            <View key={b} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                <T size={13} weight="bold" style={{ color: c.onAccent, lineHeight: 16 }}>✓</T>
              </View>
              <T style={{ flex: 1, lineHeight: 23 }}>{b}</T>
            </View>
          ))}
        </View>

        {!isPremium ? (
          <View style={{ gap: 10 }} accessibilityRole="radiogroup">
            {plans.map((p) => {
              const active = p.id === chosen;
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  onPress={() => setChosen(p.id)}
                  testID={`plan-${p.id}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    padding: 16,
                    borderRadius: 18,
                    borderWidth: active ? 2 : 1,
                    borderColor: active ? c.accent : c.line,
                    backgroundColor: active ? c.soft : c.surface,
                    boxShadow: active ? undefined : c.shadow,
                  }}
                >
                  <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: active ? c.accent : c.line, alignItems: 'center', justifyContent: 'center' }}>
                    {active ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent }} /> : null}
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <T weight="bold" size={17}>{p.id === 'annual' ? 'Год' : 'Месяц'}</T>
                      {p.id === 'annual' ? (
                        <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: c.gold }}>
                          <T size={12} weight="bold" style={{ color: c.onAccent }}>Выгоднее на 50%</T>
                        </View>
                      ) : null}
                    </View>
                    <T size={14} tone="muted">
                      {p.id === 'annual' ? `${p.price} в год${p.perMonth ? `, это ${p.perMonth} в месяц` : ''}` : `${p.price} в месяц`}
                    </T>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {note ? <T size={14} tone="bad" style={{ textAlign: 'center' }} testID="premium-note">{note}</T> : null}

        <T size={12} tone="muted" style={{ lineHeight: 18 }}>
          {plan.trial ? `Первые ${plan.trial} бесплатно, затем ${after}. ` : ''}
          Подписка продлевается автоматически, если не отменить её минимум за 24 часа до конца периода.{' '}
          {web
            ? `Оплата картой через ${WEB_PAYER}, он пришлёт чек на почту. Отменить подписку можно в любой момент по ссылке в этом письме.`
            : `Оплата списывается с аккаунта ${STORE_NAME}. Отменить подписку можно в любой момент в настройках ${STORE_NAME}.`}
        </T>
        {!isPremium || promoNote?.ok ? (
          <View style={{ gap: 10 }}>
            {!promoOpen ? (
              <Pressable accessibilityRole="button" onPress={() => setPromoOpen(true)} hitSlop={8} style={{ alignSelf: 'center' }} testID="promo-open">
                <T size={15} tone="accent" weight="medium">Есть промокод?</T>
              </Pressable>
            ) : (
              <View style={{ gap: 10, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface }}>
                <T weight="medium">Промокод</T>
                <TextInput
                  accessibilityLabel="Промокод"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  onChangeText={(v) => { setPromo(v); setPromoNote(null); }}
                  onSubmitEditing={applyPromo}
                  placeholder="ALIF-…"
                  placeholderTextColor={c.muted}
                  returnKeyType="done"
                  value={promo}
                  testID="promo-input"
                  style={{ minHeight: 50, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: c.line, backgroundColor: c.bg, color: c.ink, fontFamily: fonts.medium, fontSize: 17, letterSpacing: 1 }}
                />
                {promoBusy ? <ActivityIndicator color={c.accent} style={{ height: 52 }} /> : <Button label="Активировать" kind="quiet" onPress={applyPromo} disabled={!promo.trim()} testID="promo-apply" />}
              </View>
            )}
            {promoNote ? <T size={14} tone={promoNote.ok ? 'good' : 'bad'} style={{ textAlign: 'center' }} testID="promo-note">{promoNote.text}</T> : null}
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 18, flexWrap: 'wrap' }}>
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL(TERMS_URL)} hitSlop={8}>
            <T size={13} tone="accent">Условия использования</T>
          </Pressable>
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL(PRIVACY_URL)} hitSlop={8}>
            <T size={13} tone="accent">Конфиденциальность</T>
          </Pressable>
        </View>
      </ScrollView>

      {!isPremium ? (
        <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 14, gap: 8, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.bg }}>
          <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', gap: 6 }}>
            {busy === 'buy' ? <ActivityIndicator color={c.accent} style={{ height: 52 }} /> : <Button label={cta} onPress={buy} disabled={busy !== null} testID="buy" />}
            <Pressable accessibilityRole="button" onPress={onRestore} disabled={busy !== null} style={{ minHeight: 40, alignItems: 'center', justifyContent: 'center' }} testID="restore">
              <T size={14} tone="muted">{busy === 'restore' ? 'Проверяю…' : web ? 'Проверить оплату' : 'Восстановить покупки'}</T>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}
