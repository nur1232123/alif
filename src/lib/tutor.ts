import { E2E, serverReady, SERVER_TOKEN, SERVER_URL, testWindow } from './server';

export type TutorMessage = { role: 'user' | 'model'; text: string };
export type TutorReply = { ok: true; text: string } | { ok: false; reason: 'offline' | 'busy' | 'off' };

/** ИИ-учитель работает в приложении на телефоне, когда подключён сервер с ключом Gemini */
export const tutorEnabled = E2E ? testWindow?.__tutor !== undefined : serverReady;

export async function askTutor(messages: TutorMessage[], context = ''): Promise<TutorReply> {
  if (E2E) {
    const text = testWindow?.__tutor;
    return text ? { ok: true, text } : { ok: false, reason: 'offline' };
  }
  try {
    const response = await fetch(`${SERVER_URL}/tutor`, {
      method: 'POST',
      headers: { 'x-app-token': SERVER_TOKEN, 'content-type': 'application/json' },
      // Учитель видит последние 12 сообщений: этого хватает и не тратит лимит
      body: JSON.stringify({ messages: messages.slice(-12), context }),
    });
    if (response.status === 503) return { ok: false, reason: 'off' };
    if (response.status === 429) return { ok: false, reason: 'busy' };
    if (!response.ok) return { ok: false, reason: 'busy' };
    const data = (await response.json()) as { text?: string };
    return data.text ? { ok: true, text: data.text } : { ok: false, reason: 'busy' };
  } catch {
    return { ok: false, reason: 'offline' };
  }
}

export const TUTOR_ERRORS: Record<'offline' | 'busy' | 'off', string> = {
  offline: 'Нет связи с сервером. Проверьте интернет и что сервер запущен.',
  busy: 'Учитель сейчас занят. Попробуйте через минуту.',
  off: 'ИИ-учитель выключен: на сервере нет ключа Gemini.',
};
