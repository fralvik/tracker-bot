# tracker-bot
Bot for tracker
===ИНСТРУКЦИЯ ПО СОЗДАНИЮ===
Пререквизиты:
1. Создать аккаунт на GitHub (https://github.com/)
2. Создать аккаунт на Vercel (https://vercel.com/)
3. Создать аккаунт на Upstash (https://upstash.com/)
4. Создать телеграм бота и получить ID бота, а также ID юзера (чата), с которым будет бот общаться

Процесс создания проекта:

1. Создание проекта в Vercel
1.1. Откройте ваш браузер и перейдите на vercel.com.
Войдите в свой аккаунт Vercel, используя ваши учётные данные (например, через GitHub, если вы использовали его для входа).
1.2. Настройка интеграции с GitHub
Создадим новый проект и заново настроим интеграцию с GitHub.
1.3. Создание нового проекта в Vercel
На главной странице Vercel Dashboard нажмите на кнопку New Project (в правом верхнем углу).
В разделе Import Git Repository выберите GitHub как ваш провайдер Git.
Если Vercel запросит доступ к GitHub, подтвердите авторизацию (вы уже должны быть авторизованы, так как ранее использовали GitHub для входа).
Найдите и выберите репозиторий:
В списке репозиториев найдите ваш репозиторий tracker-bot.
Нажмите на кнопку Import рядом с названием репозитория.

2. Настройка проекта
После выбора репозитория Vercel откроет страницу настройки проекта. Давайте настроим его корректно:

Название проекта:
По умолчанию Vercel использует название репозитория (tracker-bot). Вы можете оставить его как есть или изменить.
Framework Preset:
Vercel попытается автоматически определить фреймворк. Поскольку наш проект — это Node.js приложение с Serverless Functions, выберите Other (или оставьте пустым, если Vercel не может определить фреймворк).
Build & Output Settings:
Разверните раздел Build & Output Settings и проверьте настройки:
Build Command: Оставьте пустым (у нас нет необходимости в сборке, так как это простой Node.js проект).
Output Directory: Оставьте пустым (Vercel автоматически найдёт функции в папке api).
Install Command: Оставьте значение по умолчанию (npm install).
Environment Variables:
Разверните раздел Environment Variables и добавьте необходимые переменные окружения:
TELEGRAM_TOKEN: Ваш токен от BotFather.
TELEGRAM_CHAT_ID: Ваш Chat ID.
UPSTASH_REDIS_REST_URL: URL вашей базы данных Upstash (например, https://eu1-bold-star-12345.upstash.io).
UPSTASH_REDIS_REST_TOKEN: Токен вашей базы данных Upstash (например, AXYCsid...).
Эти значения можно взять из вашей старой настройки или из панели управления Upstash (раздел REST API).
Root Directory:
Оставьте пустым, если ваш проект не использует монрепозиторий. В нашем случае все файлы находятся в корне репозитория.
Deploy:
После настройки нажмите на кнопку Deploy внизу страницы.
Vercel начнёт процесс деплоя. Вы увидите прогресс сборки и логи в реальном времени.

3. Проверка деплоя
После завершения деплоя Vercel предоставит вам URL вашего проекта (например, https://tracker-bot.vercel.app). Сохраните этот URL, он понадобится для настройки вебхука Telegram.

4. Настройка вебхука Telegram
Теперь, когда проект задеплоен, нужно настроить вебхук для Telegram, чтобы бот мог получать обновления.

Скопируйте URL вашего проекта (например, https://tracker-bot.vercel.app).
Настройте вебхук:
Откройте браузер и выполните следующий запрос:

https://api.telegram.org/bot<YOUR_TELEGRAM_TOKEN>/setWebhook?url=https://tracker-bot.vercel.app/api/telegram
Замените <YOUR_TELEGRAM_TOKEN> на ваш токен от BotFather.
Замените tracker-bot.vercel.app на ваш актуальный URL.
Вы должны увидеть ответ: {"ok":true,"result":true,"description":"Webhook was set"}.
5. Проверка интеграции с GitHub
Vercel автоматически настроит интеграцию с GitHub, и каждый новый коммит в ветку main будет вызывать новый деплой.

6. Проверка автоматического деплоя
Внесите небольшое изменение в ваш проект локально (например, добавьте пробел в README.md).
Закоммитьте и отправьте изменения:

git add README.md
git commit -m "Test auto-deployment"
git push origin main
Перейдите в Vercel → Deployments и убедитесь, что новый деплой начался автоматически.

7. Проверка настроек Git в Vercel
Перейдите в ваш проект на Vercel → Settings → Git.
Убедитесь, что:
Репозиторий указан корректно (your-username/tracker-bot).
Production Branch установлен как main.
Автоматические деплои включены (по умолчанию Vercel включает их для всех веток).

8. Проверка работы бота
После успешного деплоя и настройки вебхука протестируйте бота:

Откройте Telegram и найдите вашего бота.
Отправьте команду Задать дату покупки → введите 01.04.2025.
Убедитесь, что бот отвечает: "Дата покупки установлена: 01.04.2025. Теперь нажмите 'Начать заново'."
Попробуйте другие команды: Начать заново, Статус абонемента, Следующее занятие.

9. Настройка GitHub Actions для напоминаний
Убедимся, что GitHub Actions для отправки напоминаний настроен корректно.

9.1. Проверка файла reminder.yml
Убедитесь, что файл .github/workflows/reminder.yml существует и содержит правильные настройки:

name: Send Reminders
on:
  schedule:
    - cron: '0 17 * * *' # Каждый день в 17:00 UTC (20:00 МСК)
jobs:
  send-reminder:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: node sendReminder.js
        env:
          TELEGRAM_TOKEN: ${{ secrets.TELEGRAM_TOKEN }}
          TELEGRAM_CHAT_ID: ${{ secrets.TELEGRAM_CHAT_ID }}
          UPSTASH_REDIS_REST_URL: ${{ secrets.UPSTASH_REDIS_REST_URL }}
          UPSTASH_REDIS_REST_TOKEN: ${{ secrets.UPSTASH_REDIS_REST_TOKEN }}
9.2. Добавление секретов в GitHub
Перейдите в ваш репозиторий на GitHub → Settings → Secrets and variables → Actions.
Убедитесь, что следующие секреты добавлены:
TELEGRAM_TOKEN
TELEGRAM_CHAT_ID
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
Если их нет, добавьте их:
Нажмите New repository secret.
Введите имя секрета (например, TELEGRAM_TOKEN) и его значение.
Повторите для всех секретов.
9.3. Тестирование GitHub Actions
Временно измените расписание в reminder.yml на ближайшее время (например, через 5 минут):

on:
  schedule:
    - cron: '5 17 * * *' # Через 5 минут (17:05 UTC = 20:05 МСК)
Отправьте изменения:
bash

git add .github/workflows/reminder.yml
git commit -m "Test reminder schedule"
git push origin main
Перейдите в ваш репозиторий на GitHub → Actions → выберите workflow Send Reminders.
Дождитесь выполнения и проверьте логи. Убедитесь, что бот отправил напоминание (если сегодня день занятия: понедельник, среда или пятница).
Last updated: 10.06.2025
Last updated: 01.07.2025
Last updated: 01.08.2025
Last updated: 01.09.2025
Last updated: 01.10.2025
Last updated: 01.11.2025
Last updated: 01.12.2025
Last updated: 01.01.2026
