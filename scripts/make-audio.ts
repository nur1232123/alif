/// <reference types="node" />
// Озвучивает весь курс нейроголосом Azure и сохраняет записи в приложение.
// Запуск: AZURE_KEY=... AZURE_REGION=... npx tsx scripts/make-audio.ts
// Уже готовые записи повторно не создаются, поэтому скрипт можно запускать после каждого изменения курса.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ALL_WEEKS } from "../src/data/course";
import { LETTERS } from "../src/data/letters";

const root = path.resolve(__dirname, "..");
const KEY = process.env.AZURE_KEY ?? "";
const REGION = process.env.AZURE_REGION ?? "";
const URL =
  process.env.AZURE_TTS_URL ??
  `https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;
const VOICE = process.env.VOICE ?? "ar-SA-HamedNeural";
const OUT = process.env.AUDIO_DIR ?? path.join(root, "assets/audio");
const MANIFEST =
  process.env.AUDIO_MANIFEST ?? path.join(root, "src/data/audio.ts");

if (!KEY || (!REGION && !process.env.AZURE_TTS_URL)) {
  console.error("Укажите AZURE_KEY и AZURE_REGION");
  process.exit(1);
}

/** Все фразы, которые приложение может произнести */
function collect(): string[] {
  const texts = new Set<string>();
  LETTERS.forEach((l) => texts.add(l.say));
  for (const week of ALL_WEEKS) {
    week.items.forEach((x) => texts.add(x.say));
    week.lines?.forEach((l) => texts.add(l.ar));
    week.replyQuestions?.forEach((q) =>
      [q.line, q.right, ...q.wrong].forEach((t) => texts.add(t)),
    );
  }
  return [...texts].map((t) => t.trim()).filter(Boolean);
}

const fileFor = (text: string) =>
  `${createHash("sha1").update(text).digest("hex").slice(0, 16)}.mp3`;

const escape = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function synthesize(text: string, attempt = 1): Promise<Buffer> {
  const ssml = `<speak version="1.0" xml:lang="ar-SA"><voice name="${VOICE}"><prosody rate="-15%">${escape(text)}</prosody></voice></speak>`;
  const response = await fetch(URL, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": KEY,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      "User-Agent": "alif-course",
    },
    body: ssml,
  });
  if (response.status === 429 && attempt < 5) {
    await new Promise((r) => setTimeout(r, 2000 * attempt));
    return synthesize(text, attempt + 1);
  }
  if (!response.ok)
    throw new Error(
      `Azure ${response.status}: ${(await response.text()).slice(0, 200)}`,
    );
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const texts = collect();
  mkdirSync(OUT, { recursive: true });
  const missing = texts.filter((t) => !existsSync(path.join(OUT, fileFor(t))));
  const characters = missing.reduce((sum, t) => sum + t.length, 0);
  console.log(
    `Фраз в курсе: ${texts.length}. Нужно озвучить: ${missing.length} (${characters} символов).`,
  );

  let done = 0;
  const failed: string[] = [];
  const workers = Array.from({ length: 4 }, async () => {
    while (missing.length) {
      const text = missing.shift()!;
      try {
        writeFileSync(path.join(OUT, fileFor(text)), await synthesize(text));
        done += 1;
        if (done % 50 === 0) console.log(`Готово: ${done}`);
      } catch (error) {
        failed.push(text);
        console.error(`Не удалось: ${text}: ${(error as Error).message}`);
      }
    }
  });
  await Promise.all(workers);

  const relative = path
    .relative(path.dirname(MANIFEST), OUT)
    .split(path.sep)
    .join("/");
  const lines = texts
    .filter((t) => existsSync(path.join(OUT, fileFor(t))))
    .sort()
    .map(
      (t) => `  ${JSON.stringify(t)}: require('${relative}/${fileFor(t)}'),`,
    );
  writeFileSync(
    MANIFEST,
    `// Этот файл создаёт scripts/make-audio.ts. Не редактируйте вручную.\n// Голос: ${VOICE}\nexport const AUDIO: Record<string, number> = {\n${lines.join("\n")}\n};\n`,
  );
  console.log(
    `Записей в приложении: ${lines.length}. Ошибок: ${failed.length}.`,
  );
  if (failed.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
