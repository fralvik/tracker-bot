const TelegramBot = require('node-telegram-bot-api');
const { kv } = require('@vercel/kv');

const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const bot = new TelegramBot(TOKEN);

const DAYS_OF_CLASSES = [1, 3, 5];
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

function formatDateDDMMYYYY(date) {
  if (!date || isNaN(date.getTime())) return "Invalid Date";
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

async function updateClassDates(chatId, purchaseDate, endDate) {
  purchaseDate.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);

  let classDates = [];
  let currentDate = new Date(purchaseDate);
  while (currentDate <= endDate) {
    if (DAYS_OF_CLASSES.includes(currentDate.getDay())) {
      classDates.push(new Date(currentDate));
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  const subscription = await kv.get(`subscription:${chatId}`) || {};
  const pastData = (subscription.classes || []).filter(c => c.attended).map(c => ({
    date: parseDateDDMMYYYY(c.date),
    attended: c.attended,
    status: c.status
  }));

  pastData.sort((a, b) => a.date - b.date);

  const visited = subscription.visited || 0;
  const remaining = 8 - visited;

  let startDate = new Date(purchaseDate);
  startDate.setHours(0, 0, 0, 0);
  if (pastData.length > 0) {
    startDate = new Date(pastData[pastData.length - 1].date);
    startDate.setHours(0, 0, 0, 0);
  }

  let newDates = [];
  for (let i = 0; i < classDates.length && newDates.length < remaining; i++) {
    const classDate = classDates[i];
    if (classDate <= startDate) continue;
    newDates.push({ date: formatDateDDMMYYYY(classDate), attended: null, status: "Ожидает ответа" });
  }

  subscription.classes = [...pastData.map(c => ({ date: formatDateDDMMYYYY(c.date), attended: c.attended, status: c.status })), ...newDates];
  await kv.set(`subscription:${chatId}`, subscription);
}

async function checkAttendance() {
  try {
    const today = new Date();
    const todayStr = formatDateDDMMYYYY(today);

    if (!DAYS_OF_CLASSES.includes(today.getDay())) {
      console.log(`Today (${todayStr}) is not a class day. Skipping.`);
      return;
    }

    const subscription = await kv.get(`subscription:${CHAT_ID}`) || {};
    const endDateStr = subscription.endDate;
    const endDate = parseDateDDMMYYYY(endDateStr);
    const purchaseDateStr = subscription.purchaseDate;
    const purchaseDate = parseDateDDMMYYYY(purchaseDateStr);

    if (!endDate || !purchaseDate) {
      await bot.sendMessage(CHAT_ID, "Ошибка: Укажите дату покупки и начните заново.", { reply_markup: KEYBOARD }).catch(err => console.error('Send message error:', err));
      return;
    }

    if (today > endDate && (subscription.visited || 0) < 8) {
      const visited = subscription.visited || 0;
      await bot.sendMessage(CHAT_ID, `Абонемент истёк (${endDateStr})! Посещено: ${visited} из 8. Новый абонемент купила? Укажи дату и выбери "Начать заново".`, { reply_markup: KEYBOARD }).catch(err => console.error('Send message error:', err));
      return;
    }

    const classDates = (subscription.classes || []).map(c => c.date);
    const classIndex = classDates.findIndex(date => date === todayStr && !subscription.classes[classDates.indexOf(date)].attended);
    if (classIndex >= 0) {
      await bot.sendMessage(CHAT_ID, `Привет! Сегодня (${todayStr}) было занятие. Оно состоялось? Ответь "Да" или "Нет".`, { reply_markup: KEYBOARD }).catch(err => console.error('Send message error:', err));
      return;
    }

    if (today <= endDate && (subscription.visited || 0) < 8) {
      await updateClassDates(CHAT_ID, purchaseDate, endDate);
    }
  } catch (error) {
    console.error('Error in checkAttendance:', error);
  }
}

checkAttendance();