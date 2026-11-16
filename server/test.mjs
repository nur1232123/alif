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
let ttsCalls = 0;
let sbSeen = null;
let gumSeen = null;
let attachSeen = null;
const azure = createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    if (req.url === '/tts') {
      // Подменённый Gemini TTS: первый раз «лимит», потом PCM
      ttsCalls++;
      if (ttsCalls === 1) {
        res.writeHead(429, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { details: [{ retryDelay: '0s' }] } }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: Buffer.alloc(4800).toString('base64') } }] } }] }));
      return;
    }
    if (req.url === '/gumroad') {
      // Подменённый Gumroad: ключ на A — активная подписка, на E — закончилась, остальные не существуют
      const form = new URLSearchParams(Buffer.concat(chunks).toString());
      gumSeen = Object.fromEntries(form);
      const key = form.get('license_key') ?? '';
      if (!key.startsWith('A') && !key.startsWith('E') && !key.startsWith('9')) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'That license does not exist for the provided product.' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: true, purchase: { refunded: false, chargebacked: false, subscription_ended_at: key.startsWith('E') ? '2026-01-01T00:00:00Z' : null, subscription_failed_at: null } }));
      return;
    }
    if (req.url === '/sb/rest/v1/rpc/gumroad_attach') {
      attachSeen = { headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString()) };
      const known = attachSeen.body.p_email === 'nur@example.com';
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(known ? { ok: true, user: 'user-3', ends_at: attachSeen.body.p_ends_at } : { pending: true }));
      return;
    }
    if (req.url === '/sb/rest/v1/rpc/bind_license' || req.url === '/sb/rest/v1/rpc/my_licenses') {
      const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      const out = req.url.endsWith('my_licenses')
        ? { user: 'user-2', keys: ['AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD'] }
        : body.p_key.startsWith('9') ? { error: 'taken' } : { ok: true, user: 'user-2' };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(out));
      return;
    }
    if (req.url === '/sb/rest/v1/rpc/redeem_promo') {
      // Подменённая база: код FOREVER навсегда, MONTH на 30 дней, остальное — нет такого
      sbSeen = { headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString()) };
      const code = sbSeen.body.p_code;
      const body = code === 'FOREVER' ? { ok: true, user: 'user-1', ends_at: null }
        : code === 'MONTH' ? { ok: true, user: 'user-1', ends_at: '2030-01-01T00:00:00+00:00' }
        : { error: 'not-found' };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
      return;
    }
    if (req.url.startsWith('/rc/')) {
      rcSeen = { url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString() };
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
    GEMINI_TTS_URL: 'http://127.0.0.1:9791/tts',
    SUPABASE_URL: 'http://127.0.0.1:9791/sb',
    SUPABASE_KEY: 'sb-pub',
    GUMROAD_URL: 'http://127.0.0.1:9791/gumroad',
    GUMROAD_PRODUCT_ID: 'prod-123',
    GUMROAD_PING_SECRET: 'ping-secret-123',
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
  // Проверка Премиума для оплаты на сайте
  const premium = (user) => fetch('http://127.0.0.1:9792/premium', { headers: { 'x-app-token': 'tok', 'x-device-id': 'device-prem-0000001', 'x-rc-user': user } });
  const until = new Date(Date.now() + 7 * 86_400_000).toISOString();
  rc = {
    code: 200,
    body: {
      subscriber: {
        management_url: 'https://pay.rev.cat/manage/abc',
        entitlements: { premium: { expires_date: until, product_identifier: 'pri_123' } },
        subscriptions: { pri_123: { period_type: 'trial', store: 'paddle', unsubscribe_detected_at: null, billing_issues_detected_at: null, price: { amount: 29.99, currency: 'USD' } } },
      },
    },
  };
  assert.deepEqual(
    await (await premium('web-buyer')).json(),
    {
      premium: true,
      manageUrl: 'https://pay.rev.cat/manage/abc',
      details: { plan: 'annual', expiresAt: until, trial: true, willRenew: true, billingIssue: false, store: 'paddle', price: { amount: 29.99, currency: 'USD' } },
      checked: true,
    },
    'оплатил на сайте: год, пробный период',
  );
  rc = {
    code: 200,
    body: {
      subscriber: {
        entitlements: { premium: { expires_date: until, product_identifier: 'alif_premium_monthly' } },
        subscriptions: { alif_premium_monthly: { period_type: 'normal', store: 'play_store', unsubscribe_detected_at: '2026-11-10T00:00:00Z', billing_issues_detected_at: '2026-11-11T00:00:00Z' } },
      },
    },
  };
  const cancelled = (await (await premium('play-cancelled')).json()).details;
  assert.equal(cancelled.plan, 'monthly', 'тариф по названию продукта');
  assert.equal(cancelled.willRenew, false, 'отменённая не продлится');
  assert.equal(cancelled.billingIssue, true, 'проблема с оплатой');
  // Тестовая покупка (sandbox) не даёт Премиум ученику, но засчитывается проверяющему
  rc = {
    code: 200,
    body: { subscriber: { entitlements: { premium: { expires_date: until, product_identifier: 'pri_sbx' } }, subscriptions: { pri_sbx: { store: 'paddle', is_sandbox: true, period_type: 'trial' } } } },
  };
  assert.equal((await (await premium('sandbox-buyer')).json()).premium, false, 'тестовая карта 4242 не даёт Премиум');
  const asTester = await fetch('http://127.0.0.1:9792/premium', { headers: { 'x-app-token': 'tok', 'x-device-id': 'device-prem-0000001', 'x-rc-user': 'sandbox-buyer', 'x-tester-key': 'tester' } });
  assert.equal((await asTester.json()).premium, true, 'проверяющему тестовая покупка засчитывается');
  rc = { code: 200, body: { subscriber: { management_url: 'javascript:alert(1)', entitlements: {} } } };
  assert.deepEqual(await (await premium('web-free')).json(), { premium: false, manageUrl: null, details: null, checked: true }, 'не оплатил, странная ссылка отброшена');
  assert.equal((await fetch('http://127.0.0.1:9792/premium', { headers: { 'x-app-token': 'tok' } })).status, 400, 'без номера телефона');
  // Другой телефон считается отдельно
  assert.equal((await ask(one, 'tok', { 'x-device-id': 'device-free-0000002' })).status, 200);
  // Промокоды: только вошедшему ученику, код проверяет база, Премиум выдаёт RevenueCat
  const promo = (code, auth = 'Bearer ' + 'x'.repeat(40)) => fetch('http://127.0.0.1:9792/promo', {
    method: 'POST',
    headers: { 'x-app-token': 'tok', 'x-device-id': 'device-promo-000001', 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
    body: JSON.stringify({ code }),
  });
  assert.equal((await promo('FOREVER', null)).status, 401, 'промокод без входа');
  const bad = await promo('WRONG');
  assert.equal(bad.status, 400);
  assert.deepEqual(await bad.json(), { error: 'not-found' }, 'нет такого кода');
  rc = { code: 200, body: {} };
  const forever = await promo('FOREVER');
  assert.equal(forever.status, 200, 'код навсегда принят');
  assert.deepEqual(await forever.json(), { ok: true, endsAt: null });
  assert.equal(sbSeen.headers.apikey, 'sb-pub', 'база вызвана с публичным ключом');
  assert.equal(sbSeen.headers.authorization, 'Bearer ' + 'x'.repeat(40), 'и от имени ученика');
  assert.equal(rcSeen.url, '/rc/user-1/entitlements/premium/promotional', 'Премиум выдан нужному ученику');
  assert.equal(JSON.parse(rcSeen.body).end_time_ms, Date.UTC(2100, 0, 1), 'навсегда — до 2100 года');
  const month = await (await promo('MONTH')).json();
  assert.equal(month.endsAt, '2030-01-01T00:00:00.000Z', 'код на срок');
  assert.equal(JSON.parse(rcSeen.body).end_time_ms, Date.parse('2030-01-01T00:00:00Z'));
  rc = { code: 500, body: {} };
  assert.equal((await promo('FOREVER')).status, 502, 'RevenueCat недоступен — можно ввести снова');

  // Ключ покупки с Gumroad: проверяется у Gumroad, привязывается к аккаунту, Премиум на 3 дня с продлением
  rc = { code: 200, body: {} };
  const lic = await promo('aaaaaaaa-bbbbbbbb-cccccccc-dddddddd');
  assert.equal(lic.status, 200, 'ключ активной подписки принят');
  assert.equal((await lic.json()).subscription, true);
  assert.equal(gumSeen.product_id, 'prod-123', 'Gumroad спрошен про наш товар');
  assert.equal(gumSeen.license_key, 'AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD');
  assert.equal(gumSeen.increment_uses_count, 'false');
  assert.equal(rcSeen.url, '/rc/user-2/entitlements/premium/promotional');
  const licEnd = JSON.parse(rcSeen.body).end_time_ms;
  assert.ok(licEnd > Date.now() + 2.9 * 86400000 && licEnd < Date.now() + 3.1 * 86400000, 'Премиум на 3 дня');
  assert.deepEqual(await (await promo('EEEEEEEE-BBBBBBBB-CCCCCCCC-DDDDDDDD')).json(), { error: 'expired' }, 'подписка закончилась');
  assert.deepEqual(await (await promo('11111111-BBBBBBBB-CCCCCCCC-DDDDDDDD')).json(), { error: 'not-found' }, 'нет такого ключа');
  assert.deepEqual(await (await promo('99999999-BBBBBBBB-CCCCCCCC-DDDDDDDD')).json(), { error: 'taken' }, 'ключ чужого аккаунта');
  rcSeen = null;
  const refresh = await fetch('http://127.0.0.1:9792/license-refresh', {
    method: 'POST',
    headers: { 'x-app-token': 'tok', 'x-device-id': 'device-promo-000001', authorization: 'Bearer ' + 'x'.repeat(40) },
  });
  assert.deepEqual(await refresh.json(), { ok: true }, 'продление по сохранённому ключу');
  assert.equal(rcSeen.url, '/rc/user-2/entitlements/premium/promotional');

  // Уведомление Gumroad о покупке: Премиум включается сам, по почте покупателя
  const ping = (secret, fields) => fetch(`http://127.0.0.1:9792/gumroad-ping?secret=${secret}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  });
  const sale = { product_id: 'prod-123', email: 'nur@example.com', license_key: 'AAAAAAAA-11111111-22222222-33333333', recurrence: 'monthly', sale_timestamp: new Date().toISOString() };
  assert.equal((await ping('wrong-secret-12', sale)).status, 403, 'уведомление без секрета');
  rcSeen = null;
  assert.equal((await ping('ping-secret-123', sale)).status, 200, 'уведомление принято');
  assert.equal(attachSeen.body.p_secret, 'ping-secret-123', 'база проверяет секрет');
  assert.equal(attachSeen.body.p_key, 'AAAAAAAA-11111111-22222222-33333333');
  assert.equal(attachSeen.headers.authorization, undefined, 'без входа ученика, только публичный ключ');
  assert.equal(rcSeen.url, '/rc/user-3/entitlements/premium/promotional', 'Премиум включён сразу');
  rcSeen = null;
  assert.equal((await ping('ping-secret-123', { ...sale, email: 'new@example.com' })).status, 200, 'аккаунта ещё нет');
  assert.equal(rcSeen, null, 'Премиум выдастся, когда ученик войдёт');
  assert.deepEqual(await (await ping('ping-secret-123', { ...sale, product_id: 'other' })).json(), { ok: true, skipped: true }, 'чужой товар');
  // Без ключа покупки: узнаём по номеру подписки, срок — месяц от списания плюс 3 дня
  rcSeen = null;
  const { license_key: _skip, ...noKey } = sale;
  assert.equal((await ping('ping-secret-123', { ...noKey, subscription_id: 'sub_42' })).status, 200);
  assert.equal(attachSeen.body.p_key, 'SUB:sub_42', 'покупка по номеру подписки');
  const subEnd = JSON.parse(rcSeen.body).end_time_ms;
  assert.ok(Math.abs(subEnd - (Date.now() + 34 * 86400000)) < 60000, 'Премиум на месяц и 3 дня');
  // Пробный период: до его конца плюс 3 дня
  await ping('ping-secret-123', { ...noKey, subscription_id: 'sub_43', free_trial_ends_at: new Date(Date.now() + 7 * 86400000).toISOString() });
  assert.ok(Math.abs(JSON.parse(rcSeen.body).end_time_ms - (Date.now() + 10 * 86400000)) < 60000, 'пробная неделя и 3 дня');
  assert.deepEqual(await (await ping('ping-secret-123', { ...noKey, subscription_id: 'sub_44', refunded: 'true' })).json(), { ok: true, skipped: 'refunded' }, 'возврат');

  // Озвучка роликов: только с ключом проверяющего, потом ZIP со всеми репликами
  assert.equal((await fetch('http://127.0.0.1:9792/voiceover?id=tochki&key=wrong')).status, 403, 'озвучка без ключа');
  assert.equal((await fetch('http://127.0.0.1:9792/voiceover?id=nope&key=tester')).status, 404, 'нет такого сценария');
  assert.equal((await fetch('http://127.0.0.1:9792/voiceover?id=tochki&key=tester')).status, 202, 'озвучка началась');
  let vo;
  for (let i = 0; i < 50; i++) {
    vo = await fetch('http://127.0.0.1:9792/voiceover?id=tochki&key=tester');
    if (vo.status !== 202) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(vo.status, 200, 'озвучка готова');
  assert.equal(vo.headers.get('content-type'), 'application/zip');
  const zipBuf = Buffer.from(await vo.arrayBuffer());
  assert.equal(zipBuf.readUInt32LE(0), 0x04034b50, 'это ZIP');
  assert.equal(zipBuf.readUInt16LE(zipBuf.length - 12), 12, 'в архиве 11 реплик и lines.txt');
  assert.ok(zipBuf.includes(Buffer.from('RIFF')), 'реплики в WAV');
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
