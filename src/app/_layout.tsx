import { GolosText_400Regular } from '@expo-google-fonts/golos-text/400Regular';
import { GolosText_500Medium } from '@expo-google-fonts/golos-text/500Medium';
import { GolosText_600SemiBold } from '@expo-google-fonts/golos-text/600SemiBold';
import { ScheherazadeNew_400Regular } from '@expo-google-fonts/scheherazade-new/400Regular';
import { ScheherazadeNew_700Bold } from '@expo-google-fonts/scheherazade-new/700Bold';
import { setAudioModeAsync } from 'expo-audio';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AccountProvider } from '@/lib/account';
import { PremiumProvider } from '@/lib/premium';
import { ProgressProvider, useProgress } from '@/lib/progress';
import { setSfxEnabled } from '@/lib/sfx';
import { refreshVoice } from '@/lib/voice';
import { useColors } from '@/ui/theme';

function Routes() {
  const c = useColors();
  const { ready, progress } = useProgress();

  useEffect(() => {
    setSfxEnabled(progress.settings.sounds);
  }, [progress.settings.sounds]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

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

  useEffect(() => {
    // Звук слышен и на iPhone в беззвучном режиме
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    refreshVoice();
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
            <StatusBar style="auto" />
            <Routes />
          </PremiumProvider>
        </AccountProvider>
      </ProgressProvider>
    </SafeAreaProvider>
  );
}
