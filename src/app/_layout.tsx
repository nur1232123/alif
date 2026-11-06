import { GolosText_400Regular } from '@expo-google-fonts/golos-text/400Regular';
import { GolosText_500Medium } from '@expo-google-fonts/golos-text/500Medium';
import { GolosText_700Bold } from '@expo-google-fonts/golos-text/700Bold';
import { ScheherazadeNew_400Regular } from '@expo-google-fonts/scheherazade-new/400Regular';
import { ScheherazadeNew_700Bold } from '@expo-google-fonts/scheherazade-new/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ProgressProvider, useProgress } from '@/lib/progress';
import { useColors } from '@/ui/theme';

function Routes() {
  const c = useColors();
  const { ready, progress } = useProgress();

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
      </Stack.Protected>
      <Stack.Screen name="welcome" />
    </Stack>
  );
}

export default function RootLayout() {
  const c = useColors();
  const [loaded, failed] = useFonts({
    GolosText_400Regular,
    GolosText_500Medium,
    GolosText_700Bold,
    ScheherazadeNew_400Regular,
    ScheherazadeNew_700Bold,
  });

  if (!loaded && !failed) return <View style={{ flex: 1, backgroundColor: c.bg }} />;

  return (
    <SafeAreaProvider>
      <ProgressProvider>
        <StatusBar style="auto" />
        <Routes />
      </ProgressProvider>
    </SafeAreaProvider>
  );
}
