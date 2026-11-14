import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePremium, type SubDetails } from '@/lib/premium';
import { TEST_MODE } from '@/lib/server';
import { Button, Khatam, T } from '@/ui/kit';
import { useColors } from '@/ui/theme';

const TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL || 'https://github.com/nur1232123/alif/blob/main/TERMS.md';
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

/** «21 ноября 2026» без Intl: на части Android-телефонов он без русского языка */
export function russianDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const isWeb = (store: string | null) => !store || ['paddle', 'rc_billing', 'stripe'].includes(store);

function storeName(store: string | null) {
  if (store === 'play_store') return 'Google Play';
  if (store === 'app_store' || store === 'mac_app_store') return 'App Store';
  if (store === 'promotional') return 'подарок';
  return 'карта через Paddle';
}

/** Что сейчас с подпиской, одной-двумя фразами */
function statusText(d: SubDetails, price: string) {
  if (d.store === 'promotional' || d.expiresAt === null) {
    return d.expiresAt ? `Подарочный Премиум до ${russianDate(d.expiresAt)}.` : 'Подарочный Премиум навсегда.';
  }
  const date = russianDate(d.expiresAt);
  if (!d.willRenew) return `Подписка отменена. Премиум работает до ${date}, потом откроется бесплатная версия.`;
  if (d.trial) return `Пробный период до ${date}. Потом спишется ${price}, если не отменить подписку до этого дня.`;
  return `Следующее списание ${date}: ${price}.`;
}

/** «Моя подписка»: тариф, даты, отмена и смена карты без выхода из приложения */
export default function SubscriptionScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { isPremium, details, manageUrl, plans, restore, testPremium } = usePremium();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const plan = plans.find((p) => p.id === details?.plan);
  const price = details?.price ? `$${details.price.amount.toFixed(2)}` : (plan?.price ?? '');
  const period = details?.plan === 'annual' ? 'Год' : details?.plan === 'monthly' ? 'Месяц' : null;
  const web = isWeb(details?.store ?? null);

  const refresh = async () => {
    setBusy(true);
    setNote(null);
    await restore();
    setBusy(false);
  };

  /** Страница Paddle открывается внутри приложения; после закрытия статус обновляется */
  const openManage = async () => {
    if (!web) {
      const url = manageUrl ?? (Platform.OS === 'ios' ? 'https://apps.apple.com/account/subscriptions' : 'https://play.google.com/store/account/subscriptions');
      Linking.openURL(url);
      return;
    }
    if (!manageUrl) {
      setNote('Ссылка на управление пока недоступна. Её можно найти в письме от Paddle с чеком.');
      return;
    }
    await WebBrowser.openBrowserAsync(manageUrl, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET });
    refresh();
  };

  let body;
  if (!isPremium) {
    body = (
      <View style={{ gap: 14 }} testID="sub-none">
        <View style={{ padding: 16, borderRadius: 20, borderWidth: 1, borderColor: c.line, backgroundColor: c.surface, gap: 6 }}>
          <T weight="bold" size={17}>Подписки нет</T>
          <T tone="muted" style={{ lineHeight: 22 }}>Сейчас открыта бесплатная версия: алфавит, чтение и 3 вопроса учителю в день.</T>
        </View>
        <Button label="Оформить Премиум" onPress={() => router.replace('/premium')} testID="sub-buy" />
      </View>
    );
  } else {
    body = (
      <View style={{ gap: 14 }}>
        <View style={{ padding: 18, borderRadius: 22, borderWidth: 1.5, borderColor: details?.billingIssue ? c.bad : c.gold, backgroundColor: c.surface, boxShadow: c.shadow, gap: 12 }} testID="sub-card">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Khatam size={48} fill={c.gold}>
              <T size={18} weight="bold" style={{ color: c.onAccent, lineHeight: 22 }}>★</T>
            </Khatam>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T size={18} weight="bold">Алиф Премиум</T>
              {period ? <T size={14} tone="muted" testID="sub-plan">{period}{price ? ` · ${price}` : ''}</T> : null}
            </View>
          </View>
          {details ? (
            <>
              {details.billingIssue ? (
                <View style={{ padding: 12, borderRadius: 14, backgroundColor: c.badSoft }} testID="sub-billing-issue">
                  <T size={14} weight="bold" tone="bad">Не удалось списать оплату</T>
                  <T size={14} style={{ lineHeight: 20 }}>Обновите карту, иначе Премиум скоро отключится.</T>
                </View>
              ) : null}
              <T style={{ lineHeight: 23 }} testID="sub-status">{statusText(details, price)}</T>
              <T size={13} tone="muted">Оплата: {storeName(details.store)}</T>
            </>
          ) : (
            <T tone="muted" style={{ lineHeight: 22 }} testID="sub-status">
              {TEST_MODE && testPremium ? 'Премиум включён в режиме проверки. Выключите его в Профиле, чтобы увидеть настоящую подписку.' : 'Премиум включён.'}
            </T>
          )}
        </View>

        {details && details.store !== 'promotional' && details.expiresAt !== null ? (
          <View style={{ gap: 10 }}>
            {details.billingIssue ? <Button label="Обновить карту" onPress={openManage} testID="sub-card-update" /> : null}
            {web ? (
              <>
                {!details.billingIssue ? <Button label="Сменить карту или тариф" kind="quiet" onPress={openManage} testID="sub-manage" /> : null}
                {details.willRenew ? (
                  <Pressable accessibilityRole="button" onPress={openManage} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }} testID="sub-cancel">
                    <T size={15} tone="bad">Отменить подписку</T>
                  </Pressable>
                ) : (
                  <Button label="Возобновить подписку" onPress={openManage} testID="sub-resume" />
                )}
              </>
            ) : (
              <Button label={`Управлять в ${storeName(details.store)}`} kind="quiet" onPress={openManage} testID="sub-manage-store" />
            )}
            {web && details.willRenew ? (
              <T size={12} tone="muted" style={{ textAlign: 'center', lineHeight: 18 }}>
                Отмена и смена карты — на защищённой странице Paddle. После отмены Премиум работает до конца оплаченного срока.
              </T>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }} testID="subscription">
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: insets.bottom + 24, gap: 18, width: '100%', maxWidth: 520, alignSelf: 'center' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Закрыть" hitSlop={12} onPress={close} testID="close" style={{ alignSelf: 'flex-start' }}>
          <T size={22} weight="bold" tone="muted">✕</T>
        </Pressable>
        <T size={26} weight="bold" style={{ lineHeight: 32 }}>Моя подписка</T>
        {body}
        {note ? <T size={14} tone="bad" testID="sub-note">{note}</T> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20, flexWrap: 'wrap' }}>
          {busy ? (
            <ActivityIndicator color={c.accent} />
          ) : (
            <Pressable accessibilityRole="button" onPress={refresh} hitSlop={8} testID="sub-refresh">
              <T size={14} tone="accent">Обновить статус</T>
            </Pressable>
          )}
          <Pressable accessibilityRole="link" onPress={() => Linking.openURL(TERMS_URL)} hitSlop={8}>
            <T size={14} tone="accent">Условия и возврат денег</T>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
