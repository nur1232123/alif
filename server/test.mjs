// Проверяет сервер целиком на настоящем m4a, но с подменённым сервисом Azure
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

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
  env: { ...process.env, PORT: '9792', AZURE_ENDPOINT: 'http://127.0.0.1:9791', AZURE_KEY: 'test-key', APP_TOKEN: 'tok', PASS_SCORE: '70' },
  stdio: 'inherit',
});
await new Promise((r) => setTimeout(r, 500));

const post = (expected, { token = 'tok', file = audio } = {}) => {
  const form = new FormData();
  form.append('expected', expected);
  form.append('audio', new Blob([file], { type: 'audio/mp4' }), 'voice.m4a');
  return fetch('http://127.0.0.1:9792/check', { method: 'POST', headers: { 'x-app-token': token }, body: form });
};

try {
  reply = { body: { RecognitionStatus: 'Success', NBest: [{ AccuracyScore: 92, CompletenessScore: 100, Words: [{ ErrorType: 'None' }] }] } };
  let r = await post('بَاء');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { status: 'checked', correct: true, score: 92 });

  // Проверяем, что ушло в сервис
  assert.match(seen.url, /language=ar-SA&format=detailed/);
  assert.equal(seen.headers['ocp-apim-subscription-key'], 'test-key');
  assert.equal(seen.headers['content-type'], 'audio/wav; codecs=audio/pcm; samplerate=16000');
  const params = JSON.parse(Buffer.from(seen.headers['pronunciation-assessment'], 'base64').toString('utf8'));
  assert.equal(params.ReferenceText, 'بَاء');
  assert.equal(params.GradingSystem, 'HundredMark');
  assert.equal(seen.body.subarray(0, 4).toString(), 'RIFF');
  assert.equal(seen.body.readUInt16LE(22), 1, 'моно');
  assert.equal(seen.body.readUInt32LE(24), 16000, '16 кГц');

  reply = { body: { RecognitionStatus: 'Success', NBest: [{ AccuracyScore: 41, CompletenessScore: 100, Words: [{ ErrorType: 'Mispronunciation' }] }] } };
  assert.deepEqual(await (await post('بَاء')).json(), { status: 'checked', correct: false, score: 41 });

  reply = { body: { RecognitionStatus: 'Success', NBest: [{ AccuracyScore: 95, CompletenessScore: 0, Words: [{ ErrorType: 'Omission' }] }] } };
  assert.equal((await (await post('بَاء')).json()).correct, false, 'пропущенное слово не засчитывается');

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
