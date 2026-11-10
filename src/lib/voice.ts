import { E2E, serverReady, SERVER_TOKEN, SERVER_URL, testWindow } from './server';

/** Голос работает в приложении на телефоне, когда указан адрес сервера */
export const voiceEnabled = E2E ? testWindow?.__voice !== undefined : serverReady;

export type VoiceResult =
  | { status: 'checked'; correct: boolean; score: number; heard?: string }
  | { status: 'silent' }
  | { status: 'unavailable' };

/** alternatives: что ещё считать верным, например саму букву вместо её названия */
export async function checkVoice(uri: string, expected: string, alternatives: string[] = []): Promise<VoiceResult> {
  if (E2E && testWindow?.__voice) return testWindow.__voice as VoiceResult;
  try {
    const form = new FormData();
    form.append('expected', expected);
    if (alternatives.length) form.append('alt', alternatives.join('|'));
    // В React Native файл передаётся объектом с адресом на устройстве
    form.append('audio', { uri, name: 'voice.m4a', type: 'audio/mp4' } as unknown as Blob);
    const response = await fetch(`${SERVER_URL}/check`, {
      method: 'POST',
      headers: { 'x-app-token': SERVER_TOKEN },
      body: form,
    });
    if (!response.ok) return { status: 'unavailable' };
    const data = (await response.json()) as VoiceResult;
    return data.status === 'checked' || data.status === 'silent' ? data : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}
