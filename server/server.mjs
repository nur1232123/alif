// Сервер проверки произношения. Ключ сервиса хранится здесь, а не в приложении.
// Запуск: node server/server.mjs  Настройки: см. server/README.md
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PORT = Number(process.env.PORT ?? 8787);
const AZURE_ENDPOINT = process.env.AZURE_ENDPOINT ?? ''; // https://имя.cognitiveservices.azure.com
const AZURE_KEY = process.env.AZURE_KEY ?? '';
const APP_TOKEN = process.env.APP_TOKEN ?? '';
const LANGUAGE = process.env.SPEECH_LANGUAGE ?? 'ar-SA';
// Порог «правильно» от 0 до 100. Настраивается по реальным записям.
const PASS_SCORE = Number(process.env.PASS_SCORE ?? 70);
const MAX_BODY = 2 * 1024 * 1024;
const MAX_PER_MINUTE = 30;

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
        'ffmpeg',
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

async function assess(wav, expected) {
  const params = { ReferenceText: expected, GradingSystem: 'HundredMark', Granularity: 'Word', Dimension: 'Comprehensive', EnableMiscue: true };
  const url = `${AZURE_ENDPOINT}/stt/speech/recognition/conversation/cognitiveservices/v1?language=${LANGUAGE}&format=detailed`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': AZURE_KEY,
      'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
      Accept: 'application/json',
      'Pronunciation-Assessment': Buffer.from(JSON.stringify(params), 'utf8').toString('base64'),
    },
    body: wav,
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`Azure ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const data = await response.json();
  if (data.RecognitionStatus === 'NoMatch' || data.RecognitionStatus === 'InitialSilenceTimeout') return { status: 'silent' };
  const best = data.NBest?.[0];
  if (data.RecognitionStatus !== 'Success' || !best) throw new Error(`Azure status ${data.RecognitionStatus}`);
  const score = Math.round(best.AccuracyScore ?? 0);
  const complete = (best.CompletenessScore ?? 100) >= 100 || (best.Words ?? []).every((w) => w.ErrorType !== 'Omission');
  return { status: 'checked', correct: score >= PASS_SCORE && complete, score };
}

function send(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true });
  if (req.method !== 'POST' || req.url !== '/check') return send(res, 404, { error: 'not found' });
  if (APP_TOKEN && req.headers['x-app-token'] !== APP_TOKEN) return send(res, 401, { error: 'bad token' });
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() ?? req.socket.remoteAddress ?? 'unknown';
  if (limited(ip)) return send(res, 429, { error: 'too many requests' });
  try {
    const form = parseForm(await readBody(req), req.headers['content-type']);
    const expected = form?.expected?.toString('utf8').trim();
    if (!form?.audio?.length || !expected || expected.length > 80) return send(res, 400, { error: 'bad request' });
    send(res, 200, await assess(await toWav(form.audio), expected));
  } catch (error) {
    if (error.code === 413) return send(res, 413, { error: 'too large' });
    console.error(error.message);
    send(res, 502, { error: 'check failed' });
  }
});

server.listen(PORT, () => console.log(`Сервер проверки слушает порт ${PORT}`));
