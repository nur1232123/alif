// Проверяет скрипт озвучки на подменённом сервисе Azure
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

const dir = mkdtempSync(path.join(tmpdir(), 'alif-audio-'));
const mp3 = path.join(dir, 'beep.mp3');
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=d=0.2', '-c:a', 'libmp3lame', '-y', mp3]);
const beep = readFileSync(mp3);
const bodies = [];
const server = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    bodies.push({ body, headers: req.headers });
    res.writeHead(200, { 'content-type': 'audio/mpeg' });
    res.end(beep);
  });
});
await new Promise((r) => server.listen(9793, r));
const env = { ...process.env, AZURE_KEY: 'k', AZURE_TTS_URL: 'http://127.0.0.1:9793/tts', AUDIO_DIR: path.join(dir, 'audio'), AUDIO_MANIFEST: path.join(dir, 'audio.ts') };
// Запуск без блокировки: подменный сервис работает в этом же процессе
const run = async () => (await promisify(execFile)('npx', ['tsx', 'scripts/make-audio.ts'], { env, encoding: 'utf8' })).stdout;
try {
  const out = await run();
  const files = readdirSync(path.join(dir, 'audio'));
  const manifest = readFileSync(path.join(dir, 'audio.ts'), 'utf8');
  assert.ok(files.length > 300, `записей ${files.length}`);
  assert.equal((manifest.match(/require\(/g) ?? []).length, files.length);
  assert.ok(manifest.includes('"بَاء": require(\'audio/'));
  const first = bodies[0];
  assert.equal(first.headers['ocp-apim-subscription-key'], 'k');
  assert.equal(first.headers['x-microsoft-outputformat'], 'audio-24khz-48kbitrate-mono-mp3');
  assert.match(first.body, /<voice name="ar-SA-HamedNeural">/);
  const again = await run();
  assert.match(again, /Нужно озвучить: 0 /, 'повторный запуск ничего не озвучивает');
  console.log(out.trim().split('\n')[0]);
  console.log('Скрипт озвучки прошёл проверки');
} finally {
  server.close();
  rmSync(dir, { recursive: true, force: true });
}
