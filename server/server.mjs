// Сервер проверки произношения через бесплатное распознавание речи Azure. Ключ сервиса хранится здесь, а не в приложении.
// Запуск: node server/server.mjs  Настройки: см. server/README.md
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PORT = Number(process.env.PORT ?? 8787);
const AZURE_REGION = process.env.AZURE_REGION ?? ''; // например westeurope
// Адрес можно задать целиком: нужно для тестов и для ресурсов с собственным именем
const STT_URL =
  process.env.AZURE_STT_URL ??
  `https://${AZURE_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`;
const AZURE_KEY = process.env.AZURE_KEY ?? '';
const APP_TOKEN = process.env.APP_TOKEN ?? '';
const LANGUAGE = process.env.SPEECH_LANGUAGE ?? 'ar-SA';
// Порог «правильно» от 0 до 100: насколько услышанное похоже на ожидаемое
const PASS_SCORE = Number(process.env.PASS_SCORE ?? 75);
// ИИ-учитель
const GEMINI_KEY = process.env.GEMINI_API_KEY ?? '';
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.1-flash-lite';
const GEMINI_URL =
  process.env.GEMINI_URL ?? `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_BODY = 2 * 1024 * 1024;

// ffmpeg ставится вместе с проектом (пакет ffmpeg-static), отдельно устанавливать не нужно
const FFMPEG = (() => {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    return createRequire(import.meta.url)('ffmpeg-static') || 'ffmpeg';
  } catch {
    return 'ffmpeg';
  }
})();
const MAX_PER_MINUTE = 30;

/** Подсказывает адрес компьютера в сети: его нужно вписать в .env приложения */
async function showAddresses() {
  const { networkInterfaces } = await import('node:os');
  const ips = Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => n.address);
  for (const ip of ips) console.log(`Адрес для приложения: EXPO_PUBLIC_SERVER_URL=http://${ip}:${PORT}`);
}

const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_MINUTE;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('too large'), { code: 413 }));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Разбирает multipart/form-data: возвращает поля и файл */
function parseForm(body, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType ?? '');
  if (!match) return null;
  const boundary = Buffer.from(`--${match[1] ?? match[2]}`);
  const parts = {};
  let start = body.indexOf(boundary);
  while (start !== -1) {
    start += boundary.length;
    if (body.subarray(start, start + 2).toString() === '--') break;
    const next = body.indexOf(boundary, start);
    if (next === -1) break;
    const part = body.subarray(start + 2, next - 2);
    const split = part.indexOf('\r\n\r\n');
    if (split !== -1) {
      const head = part.subarray(0, split).toString();
      const name = /name="([^"]+)"/.exec(head)?.[1];
      if (name) parts[name] = part.subarray(split + 4);
    }
    start = next;
  }
  return parts;
}

/** Телефон пишет m4a, сервису нужен WAV: 16 кГц, моно */
async function toWav(audio) {
  const dir = await mkdtemp(path.join(tmpdir(), 'alif-'));
  const input = path.join(dir, `${randomUUID()}.m4a`);
  const output = path.join(dir, `${randomUUID()}.wav`);
  try {
    await writeFile(input, audio);
    await new Promise((resolve, reject) => {
      execFile(
        FFMPEG,
        ['-hide_banner', '-loglevel', 'error', '-i', input, '-t', '8', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-y', output],
        { timeout: 10_000 },
        (error) => (error ? reject(error) : resolve()),
      );
    });
    return await readFile(output);
  } finally {
    // Запись не хранится
    await rm(dir, { recursive: true, force: true });
  }
}

const HARAKAT = /[\u064B-\u065F\u0670\u0640]/g;

/** Убирает огласовки и знаки, приводит похожие написания к одному виду */
export function normalize(text) {
  return text
    .replace(HARAKAT, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\u0621-\u064A\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Мягкая форма: без хамзы и повторов, «باء» и «با» считаются одинаковыми */
function loose(text) {
  return normalize(text).replace(/[ءئؤ]/g, '').replace(/(.)\1+/g, '$1').replace(/\s/g, '');
}

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = temp;
    }
  }
  return row[b.length];
}

/** Похожесть от 0 до 100 */
export function similarity(heard, expected) {
  const a = loose(heard);
  const b = loose(expected);
  if (!a || !b) return 0;
  return Math.round((1 - distance(a, b) / Math.max(a.length, b.length)) * 100);
}

/** Бесплатное распознавание речи: узнаём, что сказал ученик, и сравниваем с ожидаемым */
async function assess(wav, expected, alternatives) {
  const response = await fetch(`${STT_URL}?language=${LANGUAGE}&format=detailed`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': AZURE_KEY,
      'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
      Accept: 'application/json',
    },
    body: wav,
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Azure ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const data = await response.json();
  if (['NoMatch', 'InitialSilenceTimeout', 'BabbleTimeout'].includes(data.RecognitionStatus)) return { status: 'silent' };
  if (data.RecognitionStatus !== 'Success') throw new Error(`Azure status ${data.RecognitionStatus}`);
  const heardOptions = (data.NBest ?? []).flatMap((n) => [n.Lexical, n.Display]).filter(Boolean);
  if (data.DisplayText) heardOptions.push(data.DisplayText);
  if (heardOptions.every((h) => !normalize(h))) return { status: 'silent' };
  const targets = [expected, ...alternatives];
  let score = 0;
  for (const heard of heardOptions) for (const target of targets) score = Math.max(score, similarity(heard, target));
  const heard = data.NBest?.[0]?.Display ?? data.DisplayText ?? '';
  return { status: 'checked', correct: score >= PASS_SCORE, score, heard };
}

const TUTOR_RULES = `Ты учитель арабского языка в приложении «Алиф» для русскоговорящих учеников.
Курс идёт по темам учебника «العربية بين يديك», часть 1: алфавит, огласовки, слова, чтение, разговор.
Правила ответа:
- Отвечай по-русски, коротко и просто: 2–5 предложений, без сложных терминов.
- Арабские слова всегда пиши с огласовками (харакатами), а рядом русское чтение и перевод.
- Если ученик ошибся, объясни, чем похожи и чем отличаются варианты, и дай одну подсказку, как запомнить.
- Не выдумывай. Если не уверен, скажи об этом.
- Говори только об арабском языке и учёбе. На другие темы вежливо откажись.`;

/** Вопрос учителю: история сообщений и что сейчас изучает ученик */
async function askTutor(messages, context) {
  const contents = messages.map((m) => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: m.text }] }));
  const system = context ? `${TUTOR_RULES}\n\nСейчас ученик проходит: ${context}` : TUTOR_RULES;
  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'x-goog-api-key': GEMINI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { temperature: 0.4, maxOutputTokens: 700 },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Gemini ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const data = await response.json();
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
  if (!text) throw new Error(`Gemini: пустой ответ (${data.candidates?.[0]?.finishReason ?? data.promptFeedback?.blockReason ?? 'нет причины'})`);
  return text;
}

/** Проверяет историю сообщений из приложения */
function readMessages(body) {
  let data;
  try {
    data = JSON.parse(body.toString('utf8'));
  } catch {
    return null;
  }
  const messages = Array.isArray(data?.messages) ? data.messages : null;
  if (!messages || messages.length === 0 || messages.length > 20) return null;
  const clean = messages.map((m) => ({ role: m?.role === 'model' ? 'model' : 'user', text: String(m?.text ?? '').trim().slice(0, 1500) }));
  if (clean.some((m) => !m.text) || clean[clean.length - 1].role !== 'user') return null;
  const context = typeof data.context === 'string' ? data.context.slice(0, 300) : '';
  return { messages: clean, context };
}

function send(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, voice: !!AZURE_KEY, tutor: !!GEMINI_KEY });
  if (req.method !== 'POST' || (req.url !== '/check' && req.url !== '/tutor')) return send(res, 404, { error: 'not found' });
  if (APP_TOKEN && req.headers['x-app-token'] !== APP_TOKEN) return send(res, 401, { error: 'bad token' });
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() ?? req.socket.remoteAddress ?? 'unknown';
  if (limited(ip)) return send(res, 429, { error: 'too many requests' });
  if (req.url === '/tutor') {
    if (!GEMINI_KEY) return send(res, 503, { error: 'tutor is off' });
    try {
      const input = readMessages(await readBody(req));
      if (!input) return send(res, 400, { error: 'bad request' });
      return send(res, 200, { text: await askTutor(input.messages, input.context) });
    } catch (error) {
      console.error(error.message);
      return send(res, 502, { error: 'tutor failed' });
    }
  }
  if (!AZURE_KEY) return send(res, 503, { error: 'voice is off' });
  try {
    const form = parseForm(await readBody(req), req.headers['content-type']);
    const expected = form?.expected?.toString('utf8').trim();
    const alternatives = (form?.alt?.toString('utf8') ?? '').split('|').map((x) => x.trim()).filter(Boolean).slice(0, 4);
    if (!form?.audio?.length || !expected || expected.length > 80) return send(res, 400, { error: 'bad request' });
    send(res, 200, await assess(await toWav(form.audio), expected, alternatives));
  } catch (error) {
    if (error.code === 413) return send(res, 413, { error: 'too large' });
    console.error(error.message);
    send(res, 502, { error: 'check failed' });
  }
});

// Сервер запускается, только когда файл запущен напрямую, а не импортирован в тест
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!AZURE_KEY && !GEMINI_KEY) {
    console.error('Впишите ключи в server/.env (образец: server/.env.example). Подробности в server/README.md');
    process.exit(1);
  }
  if (AZURE_KEY && !AZURE_REGION && !process.env.AZURE_STT_URL) {
    console.error('Укажите AZURE_REGION в server/.env, например westeurope');
    process.exit(1);
  }
  server.listen(PORT, () => {
    console.log(`Сервер «Алиф» работает на порту ${PORT}`);
    console.log(`Проверка голоса: ${AZURE_KEY ? 'включена' : 'выключена (нет AZURE_KEY)'}`);
    console.log(`ИИ-учитель: ${GEMINI_KEY ? `включён, модель ${GEMINI_MODEL}` : 'выключен (нет GEMINI_API_KEY)'}`);
    showAddresses();
  });
}
