// Пишет .env с публичными настройками (EXPO_PUBLIC_*) из профиля сборки в eas.json.
// Нужен для обновлений по воздуху: обновление собирается с теми же настройками, что и APK.
// Запуск: node scripts/env-from-eas.mjs preview
import { readFileSync, writeFileSync } from 'node:fs';

const name = process.argv[2] ?? 'preview';
const profiles = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8')).build;
const env = {};
const collect = (profile) => {
  const p = profiles[profile];
  if (!p) throw new Error(`Нет профиля ${profile} в eas.json`);
  if (p.extends) collect(p.extends);
  Object.assign(env, p.env ?? {});
};
collect(name);
const lines = Object.entries(env).filter(([k]) => k.startsWith('EXPO_PUBLIC_')).map(([k, v]) => `${k}=${v}`);
writeFileSync(new URL('../.env', import.meta.url), lines.join('\n') + '\n');
console.log(`.env для «${name}»: ${lines.length} настроек`);
