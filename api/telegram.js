const TelegramBot = require('node-telegram-bot-api');
const { Redis } = require('@upstash/redis');

const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Проверка переменных окружения для Telegram
if (!TOKEN || !CHAT_ID) {
  console.error('Error: TELEGRAM_TOKEN and TELEGRAM_CHAT_ID must be set in environment variables.');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN);

// Проверка переменных окружения для Upstash Redis
if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  console.error('Error: UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set in environment variables.');
  process.exit(1);
}

// Инициализация Upstash Redis
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const DAYS_OF_CLASSES = [1, 3, 5]; // Понедельник, Среда, Пятница
const KEYBOARD = {
  reply_markup: {
    keyboard: [
      ["Статус абонемента"],
      ["Следующее занятие"],
      ["Начать заново"],
      ["Задать дату покупки"]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  }
};

// Парсинг даты в формате DD.MM.YYYY
function parseDateDDMMYYYY(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.split('.');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(month) || isNaN(year) || day < 1 || day > 31 || month < 0 || month > 11) return null;
  const date = new Date(year, month, day);
  if (isNaN(date.getTime()) || date.getDate() !== day || date.getMonth() !== month || date.getFullYear() !== year) return null;
  return date;
}

// Форматирование даты в DD.MM.YYYY
function formatDateDDMMYYYY(date) {
  if (!date || isNaN(date.getTime())) return "Invalid Date";
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

// Подсчёт свободных дат
async function countAvailableDates(chatId, startDate, endDate) {
  if (!startDate || !endDate || startDate > endDate) return 0;
  let count = 0;
  let currentDate = new Date(startDate);
  currentDate.setHours(0, 0, 0, 0);
  while (currentDate <= endDate) {
    if (DAYS_OF_CLASSES.includes(currentDate.getDay())) count++;
    currentDate.setDate(currentDate.getDate() + 1);
  }

  const subscription = await redis.get(`subscription:${chatId}`) || {};
  const usedDates = (subscription.classes || []).filter(c => c.attended && new Date(parseDateDDMMYYYY(c.date)) >= startDate && new Date(parseDateDDMMYYYY(c.date)) <= endDate).length;
  return Math.max(0, count - usedDates);
}

// Обновление списка дат занятий
async function updateClassDates(chatId, purchaseDate, endDate) {
  purchaseDate.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);

  const subscription = await redis.get(`subscription:${chatId}`) || {};
  console.log('Subscription before update:', subscription);

  // Сохраняем все прошлые записи (как посещённые, так и пропущенные)
  const pastData = (subscription.classes || []).map(c => ({
    date: parseDateDDMMYYYY(c.date),
    attended: c.attended,
    status: c.status
  }));

  pastData.sort((a, b) => a.date - b.date);

  const visited = subscription.visited || 0;
  const remaining = 8 - visited; // Сколько занятий осталось посетить
  console.log('Visited:', visited, 'Remaining:', remaining);

  // Определяем дату начала для новых занятий
  let startDate;
  if (pastData.length > 0) {
    // Берём последнюю дату из существующих занятий
    startDate = new Date(pastData[pastData.length - 1].date);
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() + 1); // Начинаем с дня после последней даты
  } else {
    startDate = new Date(purchaseDate);
    startDate.setHours(0, 0, 0, 0);
  }
  console.log('Start date for new classes:', formatDateDDMMYYYY(startDate));

  // Генерируем новые даты с учётом DAYS_OF_CLASSES
  let newDates = [];
  let currentDate = new Date(startDate);
  while (currentDate <= endDate && newDates.length < remaining) {
    if (DAYS_OF_CLASSES.includes(currentDate.getDay())) {
      newDates.push({
        date: formatDateDDMMYYYY(currentDate),
        attended: null,
        status: "Ожидает ответа"
      });
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }
  console.log('New dates to be added:', newDates);

  // Обновляем subscription.classes: сохраняем все прошлые записи и добавляем новые
  subscription.classes = [
    ...pastData.map(c => ({
      date: formatDateDDMMYYYY(c.date),
      attended: c.attended,
      status: c.status
    })),
    ...newDates
  ];
  console.log('Updated subscription.classes:', subscription.classes);

  await redis.set(`subscription:${chatId}`, subscription);
  console.log('Saved subscription to Redis:', subscription);
}

// Инициализация абонемента
async function startTracker(chatId) {
  const subscription = await redis.get(`subscription:${chatId}`) || {};
  const purchaseDateStr = subscription.purchaseDate;
  const purchaseDate = parseDateDDMMYYYY(purchaseDateStr);
  if (!purchaseDate) {
    await bot.sendMessage(chatId, "Ошибка: Некорректный формат даты. Укажите дату покупки в формате DD.MM.YYYY (например, 01.03.2025).", KEYBOARD).catch(err => console.error('Send message error:', err));
    return;
  }

  const endDate = new Date(purchaseDate);
  endDate.setMonth(endDate.getMonth() + 1);
  endDate.setDate(endDate.getDate() - 1);

  subscription.purchaseDate = purchaseDateStr;
  subscription.endDate = formatDateDDMMYYYY(endDate);
  subscription.visited = 0;
  subscription.remaining = 8;
  subscription.classes = [];

  await redis.set(`subscription:${chatId}`, subscription); // Сохраняем перед вызовом updateClassDates
  await updateClassDates(chatId, purchaseDate, endDate);

  const updatedSubscription = await redis.get(`subscription:${chatId}`); // Проверяем, что сохранилось
  console.log('Final subscription after updateClassDates:', updatedSubscription);

  const firstClass = updatedSubscription.classes[0]?.date || "Нет занятий";
  await bot.sendMessage(chatId, `Абонемент начался! Первое занятие: ${firstClass}. Я спрошу вечером, было ли оно.`, KEYBOARD).catch(err => console.error('Send message error:', err));
}

// Основная функция обработки
module.exports = async (req, res) => {
  try {
    // Проверка метода запроса
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed. This endpoint only accepts POST requests from Telegram.' });
    }

    // Проверка наличия req.body
    if (!req.body) {
      console.log('No request body provided');
      return res.status(400).json({ error: 'Bad Request: No request body provided' });
    }

    const message = req.body.message;
    if (!message) {
      console.log('No message in request body');
      return res.status(200).send();
    }

    const chatId = message.chat.id.toString();
    const text = message.text.toLowerCase();

    if (chatId !== CHAT_ID) {
      console.log(`Unauthorized chat ID: ${chatId}`);
      return res.status(200).send();
    }

    let subscription = (await redis.get(`subscription:${chatId}`)) || {};

    // Проверка ожидания даты покупки
    if (subscription.awaitingPurchaseDate) {
      const newPurchaseDate = parseDateDDMMYYYY(text);
      if (!newPurchaseDate) {
        await bot.sendMessage(chatId, "Ошибка: Некорректный формат даты. Используйте DD.MM.YYYY (например, 01.03.2025). Повторите ввод.", KEYBOARD).catch(err => console.error('Send message error:', err));
        return res.status(200).send();
      }

      subscription.purchaseDate = text;
      subscription.awaitingPurchaseDate = false;
      await redis.set(`subscription:${chatId}`, subscription);
      await bot.sendMessage(chatId, `Дата покупки установлена: ${text}. Теперь нажмите "Начать заново".`, KEYBOARD).catch(err => console.error('Send message error:', err));
      return res.status(200).send();
    }

    // Обработка команд
    if (text === "задать дату покупки") {
      await bot.sendMessage(chatId, "Введите дату покупки очередного абонемента. Формат должен быть DD.MM.YYYY.", KEYBOARD).catch(err => console.error('Send message error:', err));
      subscription.awaitingPurchaseDate = true;
      await redis.set(`subscription:${chatId}`, subscription);
    } else if (text === "начать заново") {
      await startTracker(chatId);
    } else if (text === "статус абонемента") {
      const purchaseDate = parseDateDDMMYYYY(subscription.purchaseDate);
      const endDate = parseDateDDMMYYYY(subscription.endDate);
      if (!purchaseDate || !endDate) {
        await bot.sendMessage(chatId, "Ошибка: Укажите дату покупки и начните заново.", KEYBOARD).catch(err => console.error('Send message error:', err));
        return res.status(200).send();
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const availableDates = await countAvailableDates(chatId, today, endDate);
      const message = `Статус абонемента:\n- Посещено: ${subscription.visited || 0} из 8\n- Осталось: ${subscription.remaining || 8}\n- Свободных дат до ${subscription.endDate}: ${availableDates}`;
      await bot.sendMessage(chatId, message, KEYBOARD).catch(err => console.error('Send message error:', err));
    } else if (text === "следующее занятие") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const classes = subscription.classes || [];
      const nextClass = classes.find(c => {
        const classDate = parseDateDDMMYYYY(c.date);
        return classDate >= today && c.attended === null;
      });
      const nextClassDate = nextClass ? nextClass.date : "Нет запланированных";
      await bot.sendMessage(chatId, `Следующее занятие: ${nextClassDate}`, KEYBOARD).catch(err => console.error('Send message error:', err));
    } else if (text === "да" || text === "нет") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = formatDateDDMMYYYY(today);
      const purchaseDate = parseDateDDMMYYYY(subscription.purchaseDate);
      const endDate = parseDateDDMMYYYY(subscription.endDate);

      if (!purchaseDate || !endDate) {
        await bot.sendMessage(chatId, "Ошибка: Укажите дату покупки и начните заново.", KEYBOARD).catch(err => console.error('Send message error:', err));
        return res.status(200).send();
      }

      const classIndex = subscription.classes?.findIndex(c => c.date === todayStr && !c.attended);
      if (classIndex >= 0) {
        subscription.classes[classIndex].attended = text === "да" ? "Да" : "Нет";
        subscription.classes[classIndex].status = text === "да" ? "Посещено" : "Пропущено";
        if (text === "да") {
          subscription.visited = (subscription.visited || 0) + 1;
          subscription.remaining = 8 - subscription.visited;
          await bot.sendMessage(chatId, `Отлично! Посещено: ${subscription.visited} из 8.`, KEYBOARD).catch(err => console.error('Send message error:', err));
        } else {
          await bot.sendMessage(chatId, `Поняла, занятие пропущено. Осталось: ${subscription.remaining || 8}.`, KEYBOARD).catch(err => console.error('Send message error:', err));
        }
        await updateClassDates(chatId, purchaseDate, endDate);
        await redis.set(`subscription:${chatId}`, subscription);
      }
    }

    return res.status(200).send();
  } catch (error) {
    console.error('Error in telegram handler:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};