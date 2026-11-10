# Алиф

Курс арабского на год для Android и iPhone: 52 недели, 1092 урока, три урока в день. Алфавит занимает 1 неделю.
Приложение написано на Expo.

## Запуск на телефоне

```
npm install
npx expo start
```

Отсканируйте QR-код в приложении Expo Go.

## ИИ-функции: озвучка, голосовой экзамен, ИИ-учитель

Все три работают через свой небольшой сервер. Ключи лежат только в `server/.env` на вашем компьютере
и не попадают в приложение и на GitHub. Оба сервиса бесплатны в пределах лимитов.

**1. Ключ Azure Speech** (озвучка и проверка голоса)

1. Зайдите на portal.azure.com и создайте ресурс **Speech service** (бывает в разделе Azure AI services).
2. Тариф (Pricing tier): **Free F0**. Регион: например **West Europe**.
3. Откройте ресурс, раздел **Keys and Endpoint**: скопируйте **KEY 1** и **Location/Region** (например `westeurope`).

**2. Ключ Gemini** (ИИ-учитель)

1. Зайдите на aistudio.google.com и войдите аккаунтом Google.
2. Нажмите **Get API key**, затем **Create API key**, скопируйте ключ.
3. На бесплатном тарифе Google может использовать вопросы для улучшения своих сервисов, поэтому в приложении написано не вводить личные данные.

**3. Настройка** (Windows, в папке проекта)

```
npm.cmd install
copy server\.env.example server\.env
notepad server\.env
```

Впишите `AZURE_KEY`, `AZURE_REGION`, `GEMINI_API_KEY` и придумайте `APP_TOKEN` (любая длинная строка), сохраните.

**4. Озвучка курса** (один раз, около 6 тысяч символов из бесплатных 500 тысяч в месяц)

```
npm.cmd run audio
```

Записи появятся в `assets/audio`, приложение будет использовать их само. Другой голос: `VOICE=ar-SA-ZariyahNeural` в `server/.env`.

**5. Сервер** (держите окно открытым, пока проверяете приложение)

```
npm.cmd run server
```

Сервер покажет строку `EXPO_PUBLIC_SERVER_URL=http://...`. В корне проекта сделайте `copy .env.example .env`,
откройте `.env`, вставьте этот адрес и тот же `APP_TOKEN` в `EXPO_PUBLIC_SERVER_TOKEN`.

**6. Запуск приложения** (во втором окне)

```
npx.cmd expo start -c
```

Телефон и компьютер должны быть в одной сети Wi-Fi. Если Windows спросит про брандмауэр для Node.js, разрешите доступ в частной сети.
Пока адрес сервера не указан, голосовых заданий и ИИ-учителя в приложении нет, всё остальное работает.
Точность проверки голоса подбирается числом `PASS_SCORE` в `server/.env` (по умолчанию 75).

На iPhone в беззвучном режиме голос приложения может быть не слышен.

## Сборка APK

```
npx eas-cli@latest build -p android --profile preview
```

## Выпуск в App Store

Нужен аккаунт Apple Developer Program. Mac не нужен, сборка идёт в облаке Expo.

```
npx eas-cli@latest build -p ios --profile production
npx eas-cli@latest submit -p ios
```

Тексты для магазина: `STORE.md`. Политика конфиденциальности: `PRIVACY.md`.

Перед публикацией замените идентификатор `app.alifarabic.mobile` в `app.json` на свой.

## Веб-версия для просмотра

```
npm run web:build
```

Результат: один файл `web-dist/alif.html`. В нём нет голосового экзамена и ИИ-учителя.

## Проверки

```
npm run check
node server/test.mjs
node scripts/test-make-audio.mjs
```

## Где что менять

- Уроки и слова: `src/data/course.ts`
- Как собирается урок и сколько уроков в день: `src/lib/plan.ts`
- Экраны: `src/app` и `src/ui`
