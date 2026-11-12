// Собирает веб-версию в один HTML-файл. Запуск: npm run web:build
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = process.argv[2] ?? path.join(root, 'web-dist', 'alif.html');
const e2e = process.env.EXPO_PUBLIC_E2E === '1';

const useShimScheme = {
  name: 'scheme',
  setup(b) {
    b.onResolve({ filter: /^\.\/scheme$/ }, () => ({ path: path.join(root, 'web/shims/scheme.ts') }));
  },
};

const result = await build({
  entryPoints: [path.join(root, 'web/main.tsx')],
  bundle: true,
  minify: true,
  write: false,
  format: 'iife',
  target: 'es2020',
  jsx: 'automatic',
  charset: 'utf8',
  loader: { '.wav': 'dataurl', '.mp3': 'dataurl' },
  resolveExtensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.js', '.json'],
  tsconfig: path.join(root, 'tsconfig.json'),
  alias: {
    'react-native': 'react-native-web',
    'expo-router': path.join(root, 'web/shims/router.tsx'),
    'expo-speech': path.join(root, 'web/shims/speech.ts'),
    'expo-audio': path.join(root, 'web/shims/audio.ts'),
    'expo-file-system': path.join(root, 'web/shims/file-system.ts'),
    'expo-notifications': path.join(root, 'web/shims/notifications.ts'),
    '@react-native-async-storage/async-storage': path.join(root, 'web/shims/storage.ts'),
    'react-native-safe-area-context': path.join(root, 'web/shims/safe-area.tsx'),
  },
  plugins: [useShimScheme],
  define: {
    __DEV__: 'false',
    'process.env.NODE_ENV': '"production"',
    'process.env.EXPO_PUBLIC_E2E': JSON.stringify(e2e ? '1' : '0'),
    'process.env.EXPO_PUBLIC_VOICE_URL': JSON.stringify(''),
    'process.env.EXPO_PUBLIC_VOICE_TOKEN': JSON.stringify(''),
    'process.env.EXPO_PUBLIC_SERVER_URL': JSON.stringify(''),
    'process.env.EXPO_PUBLIC_SERVER_TOKEN': JSON.stringify(''),
    global: 'globalThis',
  },
});
const script = result.outputFiles[0].text.replaceAll('</script', '<\\/script');

// Шрифты встроены в страницу. Оставляем только нужные алфавиты, чтобы файл был легче.
const fonts = [
  ['GolosText_400Regular', 'golos-text/400Regular/GolosText_400Regular.ttf', 'U+0020-007E,U+00A0-00FF,U+0400-04FF,U+2010-2027,U+203A,U+2039,U+2713'],
  ['GolosText_500Medium', 'golos-text/500Medium/GolosText_500Medium.ttf', 'U+0020-007E,U+00A0-00FF,U+0400-04FF,U+2010-2027,U+203A,U+2039,U+2713'],
  ['GolosText_700Bold', 'golos-text/700Bold/GolosText_700Bold.ttf', 'U+0020-007E,U+00A0-00FF,U+0400-04FF,U+2010-2027,U+203A,U+2039,U+2713'],
  ['ScheherazadeNew_400Regular', 'scheherazade-new/400Regular/ScheherazadeNew_400Regular.ttf', 'U+0020,U+002E,U+0600-06FF,U+200C-200F,U+FB50-FDFF,U+FE70-FEFF'],
  ['ScheherazadeNew_700Bold', 'scheherazade-new/700Bold/ScheherazadeNew_700Bold.ttf', 'U+0020,U+002E,U+0600-06FF,U+200C-200F,U+FB50-FDFF,U+FE70-FEFF'],
];
const work = mkdtempSync(path.join(tmpdir(), 'alif-fonts-'));
const faces = fonts.map(([name, file, unicodes]) => {
  const target = path.join(work, `${name}.woff2`);
  execFileSync('pyftsubset', [
    path.join(root, 'node_modules/@expo-google-fonts', file),
    `--unicodes=${unicodes}`,
    '--flavor=woff2',
    '--layout-features=*',
    `--output-file=${target}`,
  ]);
  const data = readFileSync(target).toString('base64');
  return `@font-face{font-family:${name};src:url(data:font/woff2;base64,${data}) format("woff2");font-display:swap}`;
}).join('\n');
rmSync(work, { recursive: true });

const css = `
:root{--bg:#EDF3EF;--fg:#10302A;--accent:#0B6E5F}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0C1C19;--fg:#E8F2EE;--accent:#4CC2A9;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0C1C19;--fg:#E8F2EE;--accent:#4CC2A9;color-scheme:dark}
html,body{height:100%}
body{background:var(--bg);color:var(--fg);overflow:hidden}
#root{height:100%;display:flex;flex-direction:column}
[tabindex="0"]:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
`;

const page = `<title>Алиф</title>
<style>${faces}
${css}</style>
<div id="root"></div>
<script>${script}</script>
`;

mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, page);
console.log(`${out}: ${(Buffer.byteLength(page) / 1024 / 1024).toFixed(2)} МБ`);
