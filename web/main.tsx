import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TextInput, View } from 'react-native';
import Home from '@/app/index';
import LessonScreen from '@/app/lesson/[id]';
import AccountScreen from '@/app/account';
import PremiumScreen from '@/app/premium';
import SubscriptionScreen from '@/app/subscription';
import TutorScreen from '@/app/tutor';
import Welcome from '@/app/welcome';
import { AccountProvider } from '@/lib/account';
import { PremiumProvider } from '@/lib/premium';
import { EMPTY, ProgressProvider, useProgress } from '@/lib/progress';
import { setSfxEnabled } from '@/lib/sfx';
import { Button, slots, T } from '@/ui/kit';
import { fonts, useColors } from '@/ui/theme';
import { ParamsContext, router, usePath } from './shims/router';

/** Блок для просмотра и правок. В приложении на телефоне его нет. */
function PreviewTools() {
  const c = useColors();
  const { progress, replaceProgress } = useProgress();
  const [week, setWeek] = useState('21');
  const [lesson, setLesson] = useState('1');
  const field = { flex: 1, minHeight: 48, paddingHorizontal: 12, borderRadius: 12, borderWidth: 2, borderColor: c.line, color: c.ink, fontFamily: fonts.medium, fontSize: 16 };
  const open = () => {
    const w = Math.min(52, Math.max(1, Number(week) || 1));
    const n = Math.min(21, Math.max(1, Number(lesson) || 1));
    replaceProgress({ ...progress, unlocked: true });
    router.push(`/lesson/${w}-${n}`);
  };
  return (
    <View style={{ gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: c.line }} testID="preview-tools">
      <T size={14} weight="bold">Режим просмотра</T>
      <T size={13} tone="muted">Этот блок есть только в веб-версии. Он помогает посмотреть любой урок, не дожидаясь следующего дня.</T>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <T size={13} tone="muted">Неделя (1–52)</T>
          <TextInput accessibilityLabel="Неделя" inputMode="numeric" value={week} onChangeText={setWeek} style={field} testID="go-week" />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <T size={13} tone="muted">Урок (1–21)</T>
          <TextInput accessibilityLabel="Урок" inputMode="numeric" value={lesson} onChangeText={setLesson} style={field} testID="go-day" />
        </View>
      </View>
      <Button kind="quiet" label="Открыть этот урок" onPress={open} testID="go-open" />
      <Button
        kind="quiet"
        label={progress.unlocked ? 'Вернуть обычный порядок' : 'Открыть все уроки'}
        onPress={() => replaceProgress({ ...progress, unlocked: !progress.unlocked })}
        testID="unlock-all"
      />
      <Button kind="quiet" label="Следующий день" onPress={() => replaceProgress({ ...progress, today: null })} testID="next-day" />
      <Button kind="quiet" label="Начать с экрана имени" onPress={() => replaceProgress(EMPTY)} testID="reset" />
    </View>
  );
}

slots.homeFooter = PreviewTools;

function Routes() {
  const c = useColors();
  const { ready, progress } = useProgress();
  const path = usePath();
  setSfxEnabled(progress.settings.sounds);

  if (!ready) return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  // Адрес вида /account?next=premium: параметры после «?» передаются экрану, как в Expo Router
  const [pathname, query = ''] = path.split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  // Вход по почте открыт и без имени, как в приложении
  if (pathname === '/account') {
    return (
      <ParamsContext.Provider key={path} value={params}>
        <AccountScreen />
      </ParamsContext.Provider>
    );
  }
  if (!progress.name || pathname === '/welcome') return <Welcome key={path} />;

  const [, section, id] = pathname.split('/');
  const Screen = section === 'lesson' ? LessonScreen : section === 'tutor' ? TutorScreen : section === 'premium' ? PremiumScreen : section === 'subscription' ? SubscriptionScreen : Home;
  return (
    <ParamsContext.Provider key={path} value={{ ...params, id }}>
      <Screen />
    </ParamsContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(
  <ProgressProvider>
    <AccountProvider>
      <PremiumProvider>
        <Routes />
      </PremiumProvider>
    </AccountProvider>
  </ProgressProvider>,
);
