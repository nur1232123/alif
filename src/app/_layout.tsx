import { GolosText_400Regular } from '@expo-google-fonts/golos-text/400Regular';
import { GolosText_500Medium } from '@expo-google-fonts/golos-text/500Medium';
import { GolosText_600SemiBold } from '@expo-google-fonts/golos-text/600SemiBold';
import { ScheherazadeNew_400Regular } from '@expo-google-fonts/scheherazade-new/400Regular';
import { ScheherazadeNew_700Bold } from '@expo-google-fonts/scheherazade-new/700Bold';
import { setAudioModeAsync } from 'expo-audio';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AccountProvider } from '@/lib/account';
import { PremiumProvider } from '@/lib/premium';
import { ProgressProvider, useProgress } from '@/lib/progress';
import { ACTION_OFF, loadPrayer, savePrayer, schedulePrayers } from '@/lib/prayer';
import { loadSession } from '@/lib/session';
import { setSfxEnabled } from '@/lib/sfx';
import { track } from '@/lib/feedback';
import { refreshVoice } from '@/lib/voice';
import { useScheme } from '@/ui/scheme';
import { useColors } from '@/ui/theme';

function Routes() {
  const c = useColors();
  const { ready, progress } = useProgress();
  // Незаконченный урок читается до главной: она сразу предложит продолжить
  const [sessionReady, setSessionReady] = useState(false);
  useEffect(() => {
    loadSession().finally(() => setSessionReady(true));
  }, []);

  // Уведомления о намазе: обновляем на неделю вперёд при каждом запуске
  useEffect(() => {
    loadPrayer().then((p) => { if (p.notify) schedulePrayers(p); });
  }, []);

  // Нажатие на уведомление о намазе открывает вкладку «Намаз», кнопка «Отключить азан» выключает напоминания
  useEffect(() => {
    if (!ready || !progress.name) return;
    const handle = async (r: Notifications.NotificationResponse | null) => {
      const kind = r?.notification.request.content.data?.kind;
      if (!r || typeof kind !== 'string' || !kind.startsWith('prayer')) return;
      Notifications.dismissNotificationAsync(r.notification.request.identifier).catch(() => {});
      if (r.actionIdentifier === ACTION_OFF) {
        const p = await loadPrayer();
        const next = { ...p, notify: false };
        await savePrayer(next);
        await schedulePrayers(next);
        router.replace(`/?tab=prayer&off=${Date.now()}`);
      } else {
        router.replace('/?tab=prayer');
      }
    };
    Notifications.getLastNotificationResponseAsync().then(handle).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, [ready, progress.name]);

  useEffect(() => {
    setSfxEnabled(progress.settings.sounds);
  }, [progress.settings.sounds]);

  if (!ready || !sessionReady) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.bg },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Protected guard={!!progress.name}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        <Stack.Screen name="qibla" />
        <Stack.Screen name="tasbih" />
        <Stack.Screen name="namaz" />
        <Stack.Screen name="lesson/[id]" />
        <Stack.Screen name="tutor" />
        <Stack.Screen name="premium" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="subscription" />
      </Stack.Protected>
      <Stack.Screen name="welcome" />
      {/* Вход по почте открыт и до ввода имени: так ученик возвращает прогресс после переустановки */}
      <Stack.Screen name="account" options={{ animation: 'slide_from_bottom' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const c = useColors();
  const scheme = useScheme();

  useEffect(() => {
    // Звук слышен и на iPhone в беззвучном режиме
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    refreshVoice();
    track('open');
  }, []);
  const [loaded, failed] = useFonts({
    GolosText_400Regular,
    GolosText_500Medium,
    GolosText_600SemiBold,
    ScheherazadeNew_400Regular,
    ScheherazadeNew_700Bold,
  });

  if (!loaded && !failed) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  return (
    <SafeAreaProvider>
      <ProgressProvider>
        <AccountProvider>
          <PremiumProvider>
            <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
            <Routes />
          </PremiumProvider>
        </AccountProvider>
      </ProgressProvider>
    </SafeAreaProvider>
  );
}
