# Сервер проверки произношения

Приложение отправляет сюда запись, сервер переводит её в нужный формат и спрашивает Azure Speech.
Ключ Azure хранится только здесь. Его нельзя класть в приложение.

## Настройки

| Переменная | Что это |
|---|---|
| `AZURE_ENDPOINT` | Адрес ресурса Speech, например `https://alif.cognitiveservices.azure.com` |
| `AZURE_KEY` | Ключ ресурса Speech |
| `APP_TOKEN` | Любая длинная строка. Такая же нужна в `EXPO_PUBLIC_VOICE_TOKEN` |
| `SPEECH_LANGUAGE` | Язык, по умолчанию `ar-SA` |
| `PASS_SCORE` | Порог «правильно» от 0 до 100, по умолчанию 70 |

## Запуск на компьютере

Нужны Node.js 22 и ffmpeg.

```
AZURE_ENDPOINT=... AZURE_KEY=... APP_TOKEN=... node server/server.mjs
```

В Windows PowerShell:

```
$env:AZURE_ENDPOINT="..."; $env:AZURE_KEY="..."; $env:APP_TOKEN="..."; node server/server.mjs
```

## Запуск в облаке

В папке есть `Dockerfile`, он подходит для сервисов, которые запускают контейнеры.

## Проверка без Azure

`node server/test.mjs` проверяет сервер на подменённом ответе сервиса.
Этот тест не показывает, насколько точно распознаётся речь.
