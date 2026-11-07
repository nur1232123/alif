# Алиф

Курс арабского на год для Android и iPhone: 52 недели, 1092 урока, три урока в день. Алфавит занимает 3 недели.
Приложение написано на Expo.

## Запуск на телефоне

```
npm install
npx expo start
```

Отсканируйте QR-код в приложении Expo Go.

## Голосовой экзамен

1. Создайте ресурс Speech в Azure с бесплатным тарифом F0 и получите ключ и регион.
2. Запустите сервер: см. `server/README.md`.
3. Скопируйте `.env.example` в `.env` и укажите адрес сервера и токен.
4. Перезапустите `npx expo start`.

Пока адрес не указан, голосовых заданий в экзаменах нет.
Сначала проверьте точность на настоящих записях и подберите `PASS_SCORE`.

## Озвучка нейроголосом

С тем же ключом Azure можно озвучить весь курс бесплатно (около 4 тысяч символов из 500 тысяч в месяц):

```
$env:AZURE_KEY="..."; $env:AZURE_REGION="westeurope"; npx.cmd tsx scripts/make-audio.ts
```

Записи появятся в `assets/audio`, приложение начнёт их использовать само.
Голос меняется переменной `VOICE`, например `ar-SA-ZariyahNeural`.

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

Результат: один файл `web-dist/alif.html`. В нём нет голосового экзамена.

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
