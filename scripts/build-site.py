"""Собирает страницы сайта terms.html, privacy.html и refund.html из TERMS.md и PRIVACY.md.

Запуск из корня проекта: python3 scripts/build-site.py
Нужен пакет markdown: pip install markdown
"""
import re
from pathlib import Path

import markdown

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / 'site'

PAGE = """<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} — Алиф</title>
<meta name="theme-color" content="#0B6E5F">
<link rel="icon" href="img/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css">
</head>
<body>
<header class="top">
  <div class="wrap">
    <a class="brand" href="./"><img src="img/icon.png" alt="" width="36" height="36">Алиф</a>
  </div>
</header>
<main class="doc">
  <div class="wrap">
    <a class="back" href="./">На главную</a>
{body}
  </div>
</main>
<footer>
  <div class="wrap">
    <nav aria-label="Документы">
      <a href="terms.html">Условия использования</a>
      <a href="privacy.html">Конфиденциальность</a>
      <a href="refund.html">Возврат денег</a>
    </nav>
    <span class="copy">© 2026 Алиф</span>
  </div>
</footer>
</body>
</html>
"""

REFUND = """# Возврат денег

Если «Алиф Премиум» вам не подошёл, мы вернём деньги полностью. Причину объяснять не нужно.

## Как вернуть деньги

- Напишите нам в течение 14 дней после оплаты: ПОЧТА_ПОДДЕРЖКИ. Укажите почту, на которую пришёл чек.
- Или ответьте на письмо с чеком от Paddle — там же есть ссылка для помощи с заказом.
- Возврат за оплату на сайте проводит Paddle.com, наш продавец (Merchant of Record). Деньги
  возвращаются на ту же карту, обычно за 5–10 рабочих дней.

## Пробный период

Первые 7 дней подписки бесплатны. Если отменить подписку до конца пробного периода, деньги не списываются вовсе.

## Отмена подписки

Отменить можно в любой момент: в приложении (Профиль → «Моя подписка») или по ссылке в письме от Paddle.
После отмены Премиум работает до конца оплаченного срока, следующего списания не будет.

## Покупки в Google Play и App Store

Если вы оформили подписку в магазине приложений, возврат оформляется через этот магазин по его правилам.

---

# Refund policy (English)

If Alif Premium is not right for you, we will refund your payment in full within 14 days, no questions asked.
Contact SUPPORT_EMAIL or reply to your Paddle receipt. Web payments are processed and refunded by Paddle.com,
our Merchant of Record, usually within 5–10 business days. The 7-day free trial is not charged if cancelled
before it ends. Purchases made in Google Play or the App Store are refunded under the store's rules.
"""

LINKS = {'TERMS.md': 'terms.html', 'PRIVACY.md': 'privacy.html', 'refund.html': 'refund.html'}


def render(md_text: str) -> tuple[str, str]:
    html = markdown.markdown(md_text, extensions=['extra', 'sane_lists'])
    for src, dst in LINKS.items():
        html = html.replace(f'href="{src}"', f'href="{dst}"')
    title = re.search(r'<h1>(.*?)</h1>', html).group(1)
    # Остальные заголовки первого уровня (английская часть) делаем вторым уровнем
    first = html.index('</h1>') + 5
    html = html[:first] + html[first:].replace('<h1>', '<h2>').replace('</h1>', '</h2>')
    return re.sub(r'<[^>]+>', '', title), html


def main():
    pages = {
        'terms.html': (ROOT / 'TERMS.md').read_text(encoding='utf-8'),
        'privacy.html': (ROOT / 'PRIVACY.md').read_text(encoding='utf-8'),
        'refund.html': REFUND,
    }
    for name, text in pages.items():
        title, body = render(text)
        body = '\n'.join('    ' + line if line else line for line in body.splitlines())
        (SITE / name).write_text(PAGE.format(title=title, body=body), encoding='utf-8')
        print('Готово:', name)


if __name__ == '__main__':
    main()
