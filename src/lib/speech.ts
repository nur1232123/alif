import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

/**
 * Весь звук приложения проходит через этот файл. Когда появятся настоящие
 * записи диктора, достаточно заменить функцию say.
 */
let voiceId: string | undefined;

let search: Promise<boolean | null> | null = null;

/** false: на устройстве точно нет арабского голоса. null: узнать не удалось. */
export function findArabicVoice(): Promise<boolean | null> {
  search ??= lookUpVoice().then((found) => {
    // Если узнать не удалось, спросим ещё раз на следующем экране
    if (found === null) search = null;
    return found;
  });
  return search;
}

async function lookUpVoice(): Promise<boolean | null> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    // На телефоне пустой список значит «ещё не загружено», в браузере голосов просто нет
    if (voices.length === 0) return Platform.OS === 'web' ? false : null;
    const arabic = voices.filter((v) => v.language.toLowerCase().startsWith('ar'));
    const best = arabic.find((v) => v.quality === Speech.VoiceQuality.Enhanced) ?? arabic[0];
    voiceId = best?.identifier;
    return arabic.length > 0;
  } catch {
    return null;
  }
}

export function say(text: string) {
  Speech.stop();
  Speech.speak(text, { language: 'ar-SA', voice: voiceId, rate: 0.75 });
}

/** Читает реплики подряд: expo-speech ставит их в очередь */
export function sayAll(lines: string[]) {
  Speech.stop();
  for (const text of lines) {
    Speech.speak(text, { language: 'ar-SA', voice: voiceId, rate: 0.75 });
  }
}

export function stopSpeech() {
  Speech.stop();
}
