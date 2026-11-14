// Сервер проверки произношения (бесплатное распознавание речи Azure или Groq) и ИИ-учителя. Ключ сервиса хранится здесь, а не в приложении.
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
const APP_TOKEN = (process.env.APP_TOKEN ?? '').trim();
const LANGUAGE = process.env.SPEECH_LANGUAGE ?? 'ar-SA';
// Groq: бесплатное распознавание речи моделью Whisper, ключ без банковской карты
const GROQ_KEY = process.env.GROQ_API_KEY ?? '';
const GROQ_MODEL = process.env.GROQ_MODEL ?? 'whisper-large-v3';
const GROQ_URL = process.env.GROQ_URL ?? 'https://api.groq.com/openai/v1/audio/transcriptions';
const VOICE_ENGINE = AZURE_KEY ? 'Azure' : GROQ_KEY ? 'Groq' : '';
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
// Защита бесплатных лимитов Gemini и Groq
const num = (name, fallback) => Number(process.env[name] ?? fallback);
/** Запросов в минуту с одного адреса */
const MAX_PER_MINUTE = num('MAX_PER_MINUTE', 30);
/** Вопросов учителю в день без Премиума: как в приложении */
const FREE_TUTOR_PER_DAY = num('FREE_TUTOR_PER_DAY', 3);
/** Верхние границы на один телефон и на один адрес в сутки, даже с Премиумом */
const DEVICE_TUTOR_PER_DAY = num('DEVICE_TUTOR_PER_DAY', 200);
const DEVICE_VOICE_PER_DAY = num('DEVICE_VOICE_PER_DAY', 400);
const IP_TUTOR_PER_DAY = num('IP_TUTOR_PER_DAY', 300);
const IP_VOICE_PER_DAY = num('IP_VOICE_PER_DAY', 800);
/** Ключ проверяющего: с ним учитель без лимита (EXPO_PUBLIC_TESTER_KEY в приложении автора) */
const TESTER_KEY = (process.env.TESTER_KEY ?? '').trim();
/** Секретный ключ RevenueCat: по нему сервер сам проверяет, есть ли у ученика Премиум */
const RC_SECRET = (process.env.REVENUECAT_SECRET ?? '').trim();
const RC_URL = process.env.REVENUECAT_URL ?? 'https://api.revenuecat.com/v1/subscribers/';
const ENTITLEMENT = process.env.ENTITLEMENT ?? 'premium';

/** Подсказывает адрес компьютера в сети: его нужно вписать в .env приложения */
async function showAddresses() {
  const { networkInterfaces } = await import('node:os');
  const ips = Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => n.address);
  for (const ip of ips) console.log(`Адрес для приложения: EXPO_PUBLIC_SERVER_URL=http://${ip}:${PORT}`);
}

// Счётчики за сутки живут в памяти: при перезапуске сервера обнуляются, этого достаточно против злоупотреблений
const daily = new Map();
let dailyDay = '';
/** Увеличивает счётчик и говорит, превышен ли предел за сегодня */
function overDaily(key, max) {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== dailyDay) {
    daily.clear();
    dailyDay = today;
  }
  const count = (daily.get(key) ?? 0) + 1;
  daily.set(key, count);
  return count > max;
}
const peekDaily = (key) => daily.get(key) ?? 0;

const DEVICE_RE = /^[A-Za-z0-9-]{16,64}$/;

// Ответ RevenueCat кэшируется на 10 минут, чтобы не спрашивать на каждый вопрос
const premiumCache = new Map();
/** Подписка ученика в RevenueCat: есть ли Премиум и где ею управлять (отменить, сменить карту) */
async function premiumInfo(userId) {
  if (!RC_SECRET || !userId || userId.length > 200) return { active: false, manageUrl: null };
  const cached = premiumCache.get(userId);
  // «Есть Премиум» помним 10 минут, «нет» — 20 секунд: только что оплативший не должен ждать
  if (cached && Date.now() - cached.at < (cached.active ? 10 * 60_000 : 20_000)) return cached;
  let active = false;
  let manageUrl = null;
  try {
    const response = await fetch(RC_URL + encodeURIComponent(userId), {
      headers: { Authorization: `Bearer ${RC_SECRET}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (response.ok) {
      const data = await response.json();
      const ent = data?.subscriber?.entitlements?.[ENTITLEMENT];
      active = !!ent && (ent.expires_date === null || Date.parse(ent.expires_date) > Date.now());
      const url = data?.subscriber?.management_url;
      manageUrl = typeof url === 'string' && url.startsWith('https://') ? url : null;
    }
  } catch (error) {
    console.error(`RevenueCat: ${error.message}`);
  }
  const info = { active, manageUrl, at: Date.now() };
  premiumCache.set(userId, info);
  return info;
}

const hasPremium = async (userId) => (await premiumInfo(userId)).active;

/** Адрес ученика: за прокси облака настоящий адрес приходит в заголовке */
function clientIp(req) {
  const cf = req.headers['cf-connecting-ip']?.toString().trim();
  if (cf) return cf;
  return req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
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

/** Сравнивает варианты услышанного с правильным ответом и альтернативами */
function score(heardOptions, expected, alternatives, heard) {
  if (heardOptions.every((h) => !normalize(h))) return { status: 'silent' };
  const targets = [expected, ...alternatives];
  let best = 0;
  for (const h of heardOptions) for (const target of targets) best = Math.max(best, similarity(h, target));
  return { status: 'checked', correct: best >= PASS_SCORE, score: best, heard };
}

// Фразы, которые Whisper иногда «слышит» в тишине: это не речь ученика
const WHISPER_GHOSTS = ['ترجمة', 'اشتركوا', 'المشاهدة', 'شكرا لكم', 'موسيقى', 'نانسي'];

async function assessGroq(wav, expected, alternatives) {
  const form = new FormData();
  form.append('file', new Blob([wav], { type: 'audio/wav' }), 'voice.wav');
  form.append('model', GROQ_MODEL);
  form.append('language', LANGUAGE.slice(0, 2));
  form.append('response_format', 'verbose_json');
  form.append('temperature', '0');
  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_KEY}` },
    body: form,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Groq ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const data = await response.json();
  const segments = data.segments ?? [];
  const text = (data.text ?? '').trim();
  const quiet = segments.length > 0 && segments.every((s) => (s.no_speech_prob ?? 0) > 0.6);
  if (!text || quiet || WHISPER_GHOSTS.some((g) => text.includes(g))) return { status: 'silent' };
  return score([text], expected, alternatives, text);
}

/** Бесплатное распознавание речи: узнаём, что сказал ученик, и сравниваем с ожидаемым */
async function assess(wav, expected, alternatives) {
  if (!AZURE_KEY) return assessGroq(wav, expected, alternatives);
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
  return score(heardOptions, expected, alternatives, data.NBest?.[0]?.Display ?? data.DisplayText ?? '');
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
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, voice: !!VOICE_ENGINE, tutor: !!GEMINI_KEY });
  const isPremiumCheck = req.method === 'GET' && req.url === '/premium';
  if (!isPremiumCheck && (req.method !== 'POST' || (req.url !== '/check' && req.url !== '/tutor'))) return send(res, 404, { error: 'not found' });
  if (APP_TOKEN && req.headers['x-app-token']?.toString().trim() !== APP_TOKEN) {
    console.error('Приложение прислало неверный пароль. APP_TOKEN в server/.env и EXPO_PUBLIC_SERVER_TOKEN в .env должны совпадать');
    return send(res, 401, { error: 'bad token' });
  }
  const ip = clientIp(req);
  if (limited(ip)) return send(res, 429, { error: 'too many requests' });
  // Запросы принимаются только с номером телефона, который создаёт приложение
  const device = req.headers['x-device-id']?.toString() ?? '';
  if (!DEVICE_RE.test(device)) return send(res, 400, { error: 'no device' });
  // Есть ли Премиум у вошедшего ученика: приложение спрашивает после оплаты на сайте и при запуске
  if (isPremiumCheck) {
    if (overDaily(`ip-premium:${ip}`, 2000)) return send(res, 429, { error: 'too many requests' });
    const info = await premiumInfo(req.headers['x-rc-user']?.toString());
    return send(res, 200, { premium: info.active, manageUrl: info.manageUrl, checked: !!RC_SECRET });
  }
  if (req.url === '/tutor') {
    if (!GEMINI_KEY) return send(res, 503, { error: 'tutor is off' });
    if (overDaily(`ip-tutor:${ip}`, IP_TUTOR_PER_DAY) || overDaily(`dev-tutor:${device}`, DEVICE_TUTOR_PER_DAY)) {
      return send(res, 429, { error: 'too many requests' });
    }
    const tester = TESTER_KEY && req.headers['x-tester-key']?.toString().trim() === TESTER_KEY;
    const unlimited = tester || (await hasPremium(req.headers['x-rc-user']?.toString()));
    if (!unlimited && peekDaily(`free-tutor:${device}`) >= FREE_TUTOR_PER_DAY) return send(res, 429, { error: 'limit' });
    try {
      const input = readMessages(await readBody(req));
      if (!input) {
        console.error('Учитель: неверный запрос от приложения');
        return send(res, 400, { error: 'bad request' });
      }
      const text = await askTutor(input.messages, input.context);
      // Считаем только вопросы, на которые учитель ответил
      if (!unlimited) overDaily(`free-tutor:${device}`, Infinity);
      return send(res, 200, { text });
    } catch (error) {
      console.error(error.message);
      return send(res, 502, { error: 'tutor failed' });
    }
  }
  if (!VOICE_ENGINE) return send(res, 503, { error: 'voice is off' });
  if (overDaily(`ip-voice:${ip}`, IP_VOICE_PER_DAY) || overDaily(`dev-voice:${device}`, DEVICE_VOICE_PER_DAY)) {
    return send(res, 429, { error: 'too many requests' });
  }
  try {
    const form = parseForm(await readBody(req), req.headers['content-type']);
    const expected = form?.expected?.toString('utf8').trim();
    const alternatives = (form?.alt?.toString('utf8') ?? '').split('|').map((x) => x.trim()).filter(Boolean).slice(0, 4);
    if (!form?.audio?.length || !expected || expected.length > 80) {
      console.error(`Голос: неполный запрос (запись ${form?.audio?.length ?? 0} байт, ответ «${expected ?? ''}»)`);
      return send(res, 400, { error: 'bad request' });
    }
    const result = await assess(await toWav(form.audio), expected, alternatives);
    // Видно в окне сервера: помогает подобрать PASS_SCORE
    console.log(
      result.status === 'checked'
        ? `Голос: нужно «${expected}», услышано «${result.heard}», похоже на ${result.score}% → ${result.correct ? 'верно' : 'неверно'}`
        : `Голос: нужно «${expected}», речь не расслышана`,
    );
    send(res, 200, result);
  } catch (error) {
    if (error.code === 413) return send(res, 413, { error: 'too large' });
    console.error(error.message);
    send(res, 502, { error: 'check failed' });
  }
});

// Сервер запускается, только когда файл запущен напрямую, а не импортирован в тест
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!VOICE_ENGINE && !GEMINI_KEY) {
    console.error('Впишите ключи в server/.env (образец: server/.env.example). Подробности в server/README.md');
    process.exit(1);
  }
  if (AZURE_KEY && !AZURE_REGION && !process.env.AZURE_STT_URL) {
    console.error('Укажите AZURE_REGION в server/.env, например westeurope');
    process.exit(1);
  }
  server.listen(PORT, () => {
    console.log(`Сервер «Алиф» работает на порту ${PORT}`);
    console.log(`Проверка голоса: ${VOICE_ENGINE ? `включена (${VOICE_ENGINE})` : 'выключена (нет GROQ_API_KEY или AZURE_KEY)'}`);
    console.log(`ИИ-учитель: ${GEMINI_KEY ? `включён, модель ${GEMINI_MODEL}` : 'выключен (нет GEMINI_API_KEY)'}`);
    console.log(`Защита: ${FREE_TUTOR_PER_DAY} вопроса в день без Премиума${TESTER_KEY ? ', ключ проверяющего задан' : ''}${RC_SECRET ? ', Премиум проверяется через RevenueCat' : ''}`);
    showAddresses();
  });
}
