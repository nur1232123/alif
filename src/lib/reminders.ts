import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const CHANNEL = 'daily';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export const remindersSupported = Platform.OS !== 'web';

/** Ставит ежедневное напоминание. false: человек не разрешил уведомления. */
export async function scheduleReminder(name: string, hour: number, lessonsPerDay: number): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      // На Android 13+ канал должен существовать до запроса разрешения
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Ежедневное напоминание',
        // eslint-disable-next-line import/namespace -- значение есть в библиотеке, правило не видит реэкспорт
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const permission = await Notifications.requestPermissionsAsync();
    // eslint-disable-next-line import/namespace -- значение есть в библиотеке, правило не видит реэкспорт
    const granted = permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (!granted) return false;
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Алиф', body: `${name}, сегодня вас ждут ${lessonsPerDay} урока арабского` },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute: 0, channelId: CHANNEL },
    });
    return true;
  } catch {
    return false;
  }
}

export async function cancelReminder() {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // Напоминаний могло и не быть
  }
}
