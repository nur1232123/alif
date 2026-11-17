// Озвучка роликов для соцсетей голосом Gemini TTS.
// Автор открывает в браузере /voiceover?id=…&key=<TESTER_KEY>, сервер по очереди озвучивает реплики
// и отдаёт ZIP: 01.wav, 02.wav… и lines.txt. Ключ Gemini остаётся на сервере.
import { crc32 } from 'node:zlib';

/** Сценарии: каждая реплика — отдельный файл, чтобы точно поставить её в видео */
export const VOICEOVERS = {
  tochki: {
    voice: 'Puck',
    style: 'Say in Russian, in an energetic, friendly, slightly humorous voice of a short-video narrator',
    lines: [
      'Эти три буквы путают все!',
      'Когда впервые открываешь арабский алфавит… Ну, буквы как буквы.',
      'Стоп! Это же одна и та же буква?!',
      'Спокойно. Разница только в точках.',
      'Одна точка снизу — ба.',
      'Две сверху — та.',
      'Три сверху — са.',
      'А теперь угадай за три секунды!',
      'Са! Три точки сверху. Успел? Пиши в комментариях.',
      'Всё, ты уже читаешь по-арабски!',
      'Приложение «Алиф» — арабский с первой буквы. Очень скоро на Android, подпишись, чтобы не пропустить!',
    ],
  },
  // Серия «фенёк врывается»: ученик ошибается, фенёк объясняет. У каждой реплики свой голос
  sprava: {
    voice: 'Puck',
    style: 'Say in Russian, as a cheerful, overconfident young student in a funny cartoon. Pronounce single letters as their sounds, not as letter names',
    lines: [
      'Так, арабский — это легко. Читаю: б… а… т… к. Батак!',
      { text: 'Стоп-стоп-стоп! Ты читаешь задом наперёд!', voice: 'Fenrir', style: 'Say in Russian, fast and loud, as a sassy, cheeky cartoon fox who bursts in to stop a mistake' },
      { text: 'В арабском читают справа налево. Смотри: к… и… т… а… б. Китаб — книга.', voice: 'Fenrir', style: 'Say in Russian, as a sassy, quick cartoon fox explaining something obvious, slightly smug. Pronounce single letters as their sounds, not as letter names' },
      'Так вот почему у них книги открываются с другой стороны!',
      { text: 'Именно. Ещё раз прочитаешь слева — я вернусь.', voice: 'Fenrir', style: 'Say in Russian, slowly and playfully threatening, as a cheeky cartoon fox squinting at the viewer' },
      { text: 'Учи арабский правильно — приложение «Алиф», ссылка в профиле.', voice: 'Fenrir', style: 'Say in Russian, upbeat and friendly, as a cheeky cartoon fox' },
    ],
  },
};

/** Реплика бывает строкой или объектом со своим голосом */
const lineText = (l) => (typeof l === 'string' ? l : l.text);

const MODELS = (process.env.GEMINI_TTS_MODEL ?? 'gemini-3.8-flash-tts,gemini-3.8-flash-lite-tts').split(',').map((m) => m.trim()).filter(Boolean);
const ttsUrl = (model) => process.env.GEMINI_TTS_URL ?? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** WAV-заголовок для «голого» PCM 16 бит моно */
function wav(pcm, rate = 24000) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Простой ZIP без сжатия: wav всё равно почти не сжимается */
export function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

/** Одна реплика: при лимите (429) ждёт и пробует снова, при отсутствии модели берёт следующую */
async function speak(key, text, voice, style) {
  let lastError = 'нет ответа';
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const response = await fetch(ttsUrl(model), {
        method: 'POST',
        headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${style}: ${text}` }] }],
          generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
        }),
        signal: AbortSignal.timeout(90_000),
      });
      if (response.ok) {
        const data = await response.json();
        const part = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
        if (!part) { lastError = 'в ответе нет звука'; break; }
        const audio = Buffer.from(part.inlineData.data, 'base64');
        if (audio.subarray(0, 4).toString() === 'RIFF') return audio;
        const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType ?? '')?.[1]) || 24000;
        return wav(audio, rate);
      }
      const body = await response.text();
      lastError = `${model}: ${response.status} ${body.slice(0, 300)}`;
      if (response.status === 404 || response.status === 400) break; // такой модели нет — следующая
      if (response.status === 429 || response.status >= 500) {
        const delay = /"retryDelay":\s*"(\d+)/.exec(body)?.[1];
        const wait = delay === undefined ? 20 : Number(delay);
        await sleep(Math.min(wait, 60) * 1000);
        continue;
      }
      throw new Error(lastError);
    }
  }
  throw new Error(lastError);
}

const jobs = new Map();

/** Запускает озвучку или сообщает, как она идёт */
export function voiceoverJob(id, key, retry = false) {
  const script = VOICEOVERS[id];
  if (!script) return { state: 'unknown' };
  let job = jobs.get(id);
  if (job && retry && job.state !== 'running') job = null;
  if (!job) {
    job = { state: 'running', done: 0, total: script.lines.length, files: [], error: null };
    jobs.set(id, job);
    (async () => {
      try {
        for (const [i, line] of script.lines.entries()) {
          const audio = await speak(key, lineText(line), line.voice ?? script.voice, line.style ?? script.style);
          job.files.push({ name: `${String(i + 1).padStart(2, '0')}.wav`, data: audio });
          job.done = i + 1;
        }
        job.files.push({ name: 'lines.txt', data: Buffer.from(script.lines.map((l, i) => `${String(i + 1).padStart(2, '0')} ${lineText(l)}`).join('\n') + '\n') });
        job.zip = zip(job.files);
        job.state = 'done';
      } catch (error) {
        job.state = 'failed';
        job.error = error.message;
        console.error(`Озвучка ${id}: ${error.message}`);
      }
    })();
  }
  return job;
}
