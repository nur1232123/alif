// Проверяет сервер целиком на настоящем m4a, но с подменённым сервисом Azure
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
const azure = createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    seen = { url: req.url, headers: req.headers, body: Buffer.concat(chunks) };
    res.writeHead(reply.code ?? 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(reply.body));
  });
});
await new Promise((r) => azure.listen(9791, r));

const app = spawn('node', ['server/server.mjs'], {
  env: { ...process.env, PORT: '9792', AZURE_STT_URL: 'http://127.0.0.1:9791/stt', AZURE_KEY: 'test-key', APP_TOKEN: 'tok' },
  stdio: 'inherit',
});
await new Promise((r) => setTimeout(r, 500));

const post = (expected, { token = 'tok', file = audio, alt } = {}) => {
  const form = new FormData();
  form.append('expected', expected);
  if (alt) form.append('alt', alt);
  form.append('audio', new Blob([file], { type: 'audio/mp4' }), 'voice.m4a');
  return fetch('http://127.0.0.1:9792/check', { method: 'POST', headers: { 'x-app-token': token }, body: form });
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
  console.log('Сервер прошёл все проверки');
} finally {
  app.kill();
  azure.close();
  rmSync(dir, { recursive: true, force: true });
}
