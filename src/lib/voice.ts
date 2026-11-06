import { Platform } from 'react-native';

const URL = process.env.EXPO_PUBLIC_VOICE_URL ?? '';
const TOKEN = process.env.EXPO_PUBLIC_VOICE_TOKEN ?? '';
const E2E = process.env.EXPO_PUBLIC_E2E === '1';

/** В автотесте сервер заменяется ответом из страницы */
type TestWindow = { __voice?: VoiceResult };
const testWindow = (globalThis as unknown as { window?: TestWindow }).window;

/** Голос работает в приложении на телефоне, когда указан адрес сервера проверки */
export const voiceEnabled = E2E ? testWindow?.__voice !== undefined : Platform.OS !== 'web' && URL.length > 0;

export type VoiceResult =
  | { status: 'checked'; correct: boolean; score: number }
  | { status: 'silent' }
  | { status: 'unavailable' };

export async function checkVoice(uri: string, expected: string): Promise<VoiceResult> {
  if (E2E && testWindow?.__voice) return testWindow.__voice;
  try {
    const form = new FormData();
    form.append('expected', expected);
    // В React Native файл передаётся объектом с адресом на устройстве
    form.append('audio', { uri, name: 'voice.m4a', type: 'audio/mp4' } as unknown as Blob);
    const response = await fetch(`${URL}/check`, {
      method: 'POST',
      headers: { 'x-app-token': TOKEN },
      body: form,
    });
    if (!response.ok) return { status: 'unavailable' };
    const data = (await response.json()) as VoiceResult;
    return data.status === 'checked' || data.status === 'silent' ? data : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}
