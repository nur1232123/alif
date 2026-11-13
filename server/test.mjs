// Проверяет сервер целиком на настоящем m4a, но с подменёнными сервисами Azure, Groq и Gemini
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { normalize, similarity } from './server.mjs';

// Сравнение слов
assert.equal(normalize('بَاءٌ'), 'باء');
assert.equal(normalize('أَنَا'), 'انا');
assert.ok(similarity('باء', 'بَاء') === 100);
assert.ok(similarity('با', 'بَاء') === 100, 'без хамзы тоже правильно');
assert.ok(similarity('ساد', 'صَاد') < 75, 'с и ص разные');
assert.ok(similarity('تاء', 'طَاء') < 75, 'т и ط разные');
assert.ok(similarity('ها', 'حَاء') < 75, 'ه и ح разные');
assert.ok(similarity('مدرسه', 'الْمَدْرَسَةُ') < 100);
assert.ok(similarity('السلام عليكم', 'السَّلَامُ عَلَيْكُمْ') === 100, 'фраза');
assert.ok(similarity('', 'بَاء') === 0);


const dir = mkdtempSync(path.join(tmpdir(), 'alif-test-'));
const m4a = path.join(dir, 'a.m4a');
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-ac', '2', '-ar', '44100', '-c:a', 'aac', '-y', m4a]);
const audio = readFileSync(m4a);

let reply = null;
let seen = null;
// Подменённый RevenueCat: какой ответ отдать про Премиум
let rc = { code: 200, body: { subscriber: { entitlements: {} } } };
let rcSeen = null;
const azure = createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    if (req.url.startsWith('/rc/')) {
      rcSeen = { url: req.url, headers: req.headers };
      res.writeHead(rc.code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(rc.body));
      return;
    }
    seen = { url: req.url, headers: req.headers, body: Buffer.concat(chunks) };
    res.writeHead(reply.code ?? 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(reply.body));
  });
});
await new Promise((r) => azure.listen(9791, r));

const app = spawn('node', ['server/server.mjs'], {
  env: {
    ...process.env,
    PORT: '9792',
    AZURE_STT_URL: 'http://127.0.0.1:9791/stt',
    AZURE_KEY: 'test-key',
    APP_TOKEN: 'tok',
    GEMINI_API_KEY: 'g-key',
    GEMINI_URL: 'http://127.0.0.1:9791/gemini',
    TESTER_KEY: 'tester',
    REVENUECAT_SECRET: 'rc-secret',
    REVENUECAT_URL: 'http://127.0.0.1:9791/rc/',
    MAX_PER_MINUTE: '1000',
  },
  stdio: 'inherit',
});
await new Promise((r) => setTimeout(r, 500));

const post = (expected, { token = 'tok', file = audio, alt } = {}) => {
  const form = new FormData();
  form.append('expected', expected);
  if (alt) form.append('alt', alt);
  form.append('audio', new Blob([file], { type: 'audio/mp4' }), 'voice.m4a');
  return fetch('http://127.0.0.1:9792/check', { method: 'POST', headers: { 'x-app-token': token, 'x-device-id': 'device-voice-000001' }, body: form });
};

try {
  reply = { body: { RecognitionStatus: 'Success', DisplayText: 'باء.', NBest: [{ Lexical: 'باء', Display: 'باء.' }] } };
  let r = await post('بَاء');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { status: 'checked', correct: true, score: 100, heard: 'باء.' });

  // Проверяем, что ушло в сервис
  assert.match(seen.url, /^\/stt\?language=ar-SA&format=detailed/);
  assert.equal(seen.headers['ocp-apim-subscription-key'], 'test-key');
  assert.equal(seen.headers['content-type'], 'audio/wav; codecs=audio/pcm; samplerate=16000');
  assert.equal(seen.headers['pronunciation-assessment'], undefined, 'платная оценка не используется');
  assert.equal(seen.body.subarray(0, 4).toString(), 'RIFF');
  assert.equal(seen.body.readUInt16LE(22), 1, 'моно');
  assert.equal(seen.body.readUInt32LE(24), 16000, '16 кГц');

  // Похожая, но другая буква
  reply = { body: { RecognitionStatus: 'Success', NBest: [{ Lexical: 'ساد', Display: 'ساد' }] } };
  let j = await (await post('صَاد')).json();
  assert.equal(j.correct, false);
  assert.equal(j.heard, 'ساد');

  // Сервис услышал саму букву: подходит запасной вариант
  reply = { body: { RecognitionStatus: 'Success', NBest: [{ Lexical: 'ب', Display: 'ب' }] } };
  assert.equal((await (await post('بَاء', { alt: 'ب' })).json()).correct, true);
  assert.equal((await (await post('بَاء')).json()).correct, false);

  // Верный ответ во втором варианте распознавания
  reply = { body: { RecognitionStatus: 'Success', NBest: [{ Lexical: 'بات', Display: 'بات' }, { Lexical: 'باء', Display: 'باء' }] } };
  assert.equal((await (await post('بَاء')).json()).correct, true);

  // Распознано что-то не арабское
  reply = { body: { RecognitionStatus: 'Success', NBest: [{ Lexical: 'okay', Display: 'Okay.' }] } };
  assert.deepEqual(await (await post('بَاء')).json(), { status: 'silent' });

  reply = { body: { RecognitionStatus: 'NoMatch' } };
  assert.deepEqual(await (await post('بَاء')).json(), { status: 'silent' });

  reply = { code: 500, body: { error: 'boom' } };
  assert.equal((await post('بَاء')).status, 502);

  assert.equal((await post('بَاء', { token: 'wrong' })).status, 401);
  assert.equal((await post('')).status, 400);
  assert.equal((await post('بَاء', { file: Buffer.from('not audio') })).status, 502);
  assert.equal((await post('بَاء', { file: Buffer.alloc(3 * 1024 * 1024) }).catch(() => ({ status: 413 }))).status, 413);
  // ИИ-учитель
  const ask = (body, token = 'tok', extra = { 'x-device-id': 'device-tester-00001', 'x-tester-key': 'tester' }) =>
    fetch('http://127.0.0.1:9792/tutor', { method: 'POST', headers: { 'x-app-token': token, 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) });
  reply = { body: { candidates: [{ content: { parts: [{ text: 'Буква ص звучит твёрже, чем س.' }] } }] } };
  r = await ask({ messages: [{ role: 'user', text: 'Почему ص, а не س?' }], context: 'Неделя 1, алфавит' });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { text: 'Буква ص звучит твёрже, чем س.' });
  assert.equal(seen.url, '/gemini');
  assert.equal(seen.headers['x-goog-api-key'], 'g-key');
  const sent = JSON.parse(seen.body.toString('utf8'));
  assert.match(sent.system_instruction.parts[0].text, /учитель арабского/);
  assert.match(sent.system_instruction.parts[0].text, /Неделя 1, алфавит/);
  assert.deepEqual(sent.contents, [{ role: 'user', parts: [{ text: 'Почему ص, а не س?' }] }]);
  assert.equal(sent.generationConfig.maxOutputTokens, 700);
  // Многоходовой разговор
  await ask({ messages: [{ role: 'user', text: 'а' }, { role: 'model', text: 'б' }, { role: 'user', text: 'в' }] });
  assert.deepEqual(JSON.parse(seen.body.toString('utf8')).contents.map((c) => c.role), ['user', 'model', 'user']);
  // Ошибки
  assert.equal((await ask({ messages: [] })).status, 400, 'пустой разговор');
  assert.equal((await ask({ messages: [{ role: 'model', text: 'x' }] })).status, 400, 'последним должен быть ученик');
  assert.equal((await ask({ messages: Array.from({ length: 21 }, () => ({ role: 'user', text: 'x' })) })).status, 400, 'слишком длинный разговор');
  assert.equal((await ask({ messages: [{ role: 'user', text: 'x' }] }, 'wrong')).status, 401);
  reply = { body: { candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }] } };
  assert.equal((await ask({ messages: [{ role: 'user', text: 'x' }] })).status, 502, 'пустой ответ');
  reply = { code: 429, body: { error: 'quota' } };
  assert.equal((await ask({ messages: [{ role: 'user', text: 'x' }] })).status, 502, 'лимит Gemini');

  // Защита: без номера телефона запрос не принимается
  const one = { messages: [{ role: 'user', text: 'x' }] };
  assert.equal((await ask(one, 'tok', {})).status, 400, 'нет номера телефона');
  assert.equal((await ask(one, 'tok', { 'x-device-id': 'short' })).status, 400, 'странный номер');
  // Бесплатный ученик: 3 вопроса в день, неудачные ответы не считаются
  const free = { 'x-device-id': 'device-free-0000001' };
  reply = { code: 500, body: { error: 'down' } };
  assert.equal((await ask(one, 'tok', free)).status, 502);
  reply = { body: { candidates: [{ content: { parts: [{ text: 'ok' }] } }] } };
  for (let i = 1; i <= 3; i++) assert.equal((await ask(one, 'tok', free)).status, 200, `бесплатный вопрос ${i}`);
  r = await ask(one, 'tok', free);
  assert.equal(r.status, 429, 'четвёртый вопрос без Премиума');
  assert.deepEqual(await r.json(), { error: 'limit' });
  assert.equal((await ask(one, 'tok', { ...free, 'x-tester-key': 'wrong' })).status, 429, 'чужой ключ проверяющего');
  assert.equal((await ask(one, 'tok', { ...free, 'x-tester-key': 'tester' })).status, 200, 'ключ проверяющего без лимита');
  // Премиум проверяется на сервере через RevenueCat
  rc = { code: 200, body: { subscriber: { entitlements: { premium: { expires_date: new Date(Date.now() + 86_400_000).toISOString() } } } } };
  assert.equal((await ask(one, 'tok', { ...free, 'x-rc-user': '$RCAnonymousID:abc' })).status, 200, 'Премиум без лимита');
  assert.equal(rcSeen.url, '/rc/%24RCAnonymousID%3Aabc');
  assert.equal(rcSeen.headers.authorization, 'Bearer rc-secret');
  rc = { code: 200, body: { subscriber: { entitlements: { premium: { expires_date: '2020-01-01T00:00:00Z' } } } } };
  assert.equal((await ask(one, 'tok', { ...free, 'x-rc-user': 'expired-user' })).status, 429, 'истёкший Премиум');
  rc = { code: 200, body: { subscriber: { entitlements: { premium: { expires_date: null } } } } };
  assert.equal((await ask(one, 'tok', { ...free, 'x-rc-user': 'lifetime-user' })).status, 200, 'подарочный Премиум навсегда');
  rc = { code: 500, body: {} };
  assert.equal((await ask(one, 'tok', { ...free, 'x-rc-user': 'rc-down-user' })).status, 429, 'RevenueCat недоступен: как бесплатный');
  // Другой телефон считается отдельно
  assert.equal((await ask(one, 'tok', { 'x-device-id': 'device-free-0000002' })).status, 200);
  const health = await (await fetch('http://127.0.0.1:9792/health')).json();
  assert.deepEqual(health, { ok: true, voice: true, tutor: true });

  // Groq вместо Azure: ключ без банковской карты
  const groq = spawn('node', ['server/server.mjs'], {
    env: { ...process.env, PORT: '9794', GROQ_API_KEY: 'gq-key', GROQ_URL: 'http://127.0.0.1:9791/groq', AZURE_KEY: '', GEMINI_API_KEY: '', DEVICE_VOICE_PER_DAY: '7' },
    stdio: 'inherit',
  });
  await new Promise((r) => setTimeout(r, 500));
  try {
    const postGroq = (expected, alt) => {
      const form = new FormData();
      form.append('expected', expected);
      if (alt) form.append('alt', alt);
      form.append('audio', new Blob([audio], { type: 'audio/mp4' }), 'voice.m4a');
      return fetch('http://127.0.0.1:9794/check', { method: 'POST', headers: { 'x-device-id': 'device-groq-0000001' }, body: form });
    };
    reply = { body: { text: ' باء', segments: [{ no_speech_prob: 0.05 }] } };
    assert.deepEqual(await (await postGroq('بَاء')).json(), { status: 'checked', correct: true, score: 100, heard: 'باء' });
    assert.equal(seen.url, '/groq');
    assert.equal(seen.headers.authorization, 'Bearer gq-key');
    const body = seen.body.toString('latin1');
    assert.match(body, /name="model"\r\n\r\nwhisper-large-v3/);
    assert.match(body, /name="language"\r\n\r\nar\r\n/);
    assert.match(body, /name="response_format"\r\n\r\nverbose_json/);
    assert.ok(body.includes('RIFF'), 'отправлен wav');
    reply = { body: { text: 'ساد', segments: [{ no_speech_prob: 0.1 }] } };
    assert.equal((await (await postGroq('صَاد')).json()).correct, false, 'похожая буква не засчитана');
    reply = { body: { text: 'ب', segments: [{ no_speech_prob: 0.1 }] } };
    assert.equal((await (await postGroq('بَاء', 'ب')).json()).correct, true, 'запасной вариант');
    reply = { body: { text: 'ترجمة نانسي قنقر', segments: [{ no_speech_prob: 0.2 }] } };
    assert.deepEqual(await (await postGroq('بَاء')).json(), { status: 'silent' }, 'выдуманная фраза в тишине');
    reply = { body: { text: 'با', segments: [{ no_speech_prob: 0.9 }] } };
    assert.deepEqual(await (await postGroq('بَاء')).json(), { status: 'silent' }, 'тишина');
    reply = { body: { text: '' } };
    assert.deepEqual(await (await postGroq('بَاء')).json(), { status: 'silent' });
    reply = { code: 429, body: { error: 'rate' } };
    assert.equal((await postGroq('بَاء')).status, 502);
    // Дневной предел проверок голоса на один телефон
    reply = { body: { text: 'باء', segments: [{ no_speech_prob: 0.05 }] } };
    assert.equal((await postGroq('بَاء')).status, 429, 'восьмая проверка при пределе 7');
    assert.deepEqual(await (await fetch('http://127.0.0.1:9794/health')).json(), { ok: true, voice: true, tutor: false });
  } finally {
    groq.kill();
  }
  // Предел запросов в минуту с одного адреса
  const strict = spawn('node', ['server/server.mjs'], {
    env: { ...process.env, PORT: '9795', GEMINI_API_KEY: 'g-key', GEMINI_URL: 'http://127.0.0.1:9791/gemini', MAX_PER_MINUTE: '2', TESTER_KEY: 't' },
    stdio: 'inherit',
  });
  await new Promise((r) => setTimeout(r, 500));
  try {
    reply = { body: { candidates: [{ content: { parts: [{ text: 'ok' }] } }] } };
    const quick = () =>
      fetch('http://127.0.0.1:9795/tutor', { method: 'POST', headers: { 'content-type': 'application/json', 'x-device-id': 'device-quick-000001', 'x-tester-key': 't' }, body: JSON.stringify({ messages: [{ role: 'user', text: 'x' }] }) });
    assert.equal((await quick()).status, 200);
    assert.equal((await quick()).status, 200);
    assert.equal((await quick()).status, 429, 'третий запрос за минуту при пределе 2');
  } finally {
    strict.kill();
  }
  console.log('Сервер прошёл все проверки');
} finally {
  app.kill();
  azure.close();
  rmSync(dir, { recursive: true, force: true });
}
