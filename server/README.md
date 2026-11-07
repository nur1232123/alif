# Сервер проверки произношения

Приложение отправляет сюда запись. Сервер распознаёт речь бесплатным тарифом Azure Speech
(5 часов в месяц) и сравнивает услышанное с правильным ответом.
Ключ Azure хранится только здесь. Его нельзя класть в приложение.

## Настройки

| Переменная | Что это |
|---|---|
| `AZURE_KEY` | Ключ ресурса Speech |
| `AZURE_REGION` | Регион ресурса, например `westeurope` |
| `APP_TOKEN` | Любая длинная строка. Такая же нужна в `EXPO_PUBLIC_VOICE_TOKEN` |
| `SPEECH_LANGUAGE` | Язык, по умолчанию `ar-SA` |
| `PASS_SCORE` | Насколько услышанное должно совпадать с ответом, от 0 до 100. По умолчанию 75 |

## Запуск на компьютере

Нужны Node.js 22 и ffmpeg.

Windows PowerShell:

```
$env:AZURE_KEY="..."; $env:AZURE_REGION="westeurope"; $env:APP_TOKEN="..."; node server/server.mjs
```

macOS и Linux:

```
AZURE_KEY=... AZURE_REGION=westeurope APP_TOKEN=... node server/server.mjs
```

Телефон с Expo Go должен быть в той же сети Wi-Fi. В `.env` приложения укажите адрес компьютера,
например `EXPO_PUBLIC_VOICE_URL=http://192.168.1.10:8787`.

## Для App Store

iPhone принимает только адреса `https`. Перед выпуском запустите сервер в облаке
(в папке есть `Dockerfile`) и укажите его адрес `https://...` в `EXPO_PUBLIC_VOICE_URL`.

## Проверка без Azure

`node server/test.mjs` проверяет сервер на подменённом ответе сервиса.
Этот тест не показывает, насколько точно распознаётся речь.
