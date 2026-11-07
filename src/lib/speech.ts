import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';
import { AUDIO } from '@/data/audio';

/**
 * Весь звук приложения проходит через этот файл.
 * Если для текста есть запись нейроголоса, играет она, иначе говорит голос телефона.
 */
export const hasRecordings = Object.keys(AUDIO).length > 0;

let voiceId: string | undefined;
let search: Promise<boolean | null> | null = null;

/** false: на устройстве точно нет арабского голоса. null: узнать не удалось. */
export function findArabicVoice(): Promise<boolean | null> {
  if (hasRecordings) return Promise.resolve(true);
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

let player: AudioPlayer | null = null;
let queue: string[] = [];
// Номер текущей очереди: старые колбэки после остановки ничего не делают
let run = 0;

function getPlayer() {
  if (!player) {
    player = createAudioPlayer(null);
    player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) playNext(run);
    });
  }
  return player;
}

function playNext(current: number) {
  if (current !== run) return;
  const text = queue.shift();
  if (text === undefined) return;
  const recorded = AUDIO[text];
  if (recorded !== undefined) {
    try {
      const p = getPlayer();
      p.replace(recorded);
      p.play();
      return;
    } catch {
      // Запись не проигралась: читаем голосом телефона
    }
  }
  Speech.speak(text, { language: 'ar-SA', voice: voiceId, rate: 0.75, onDone: () => playNext(current) });
}

export function stopSpeech() {
  run += 1;
  queue = [];
  Speech.stop();
  try {
    player?.pause();
  } catch {
    // Плеер мог быть ещё не создан
  }
}

export function say(text: string) {
  sayAll([text]);
}

/** Читает реплики по очереди */
export function sayAll(lines: string[]) {
  stopSpeech();
  queue = [...lines];
  playNext(run);
}
