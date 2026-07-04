const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE;
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const OWNER_USERNAME = "vicerapgod";

const headers = {
  apikey: SERVICE_KEY,
  Authorization: Bearer ${SERVICE_KEY},
  "Content-Type": "application/json"
};

function res(data) {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  };
}

async function db(path, options = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) }
  });

  const text = await r.text();
  if (!r.ok) throw new Error(text);
  return text ? JSON.parse(text) : null;
}

function isOwner(user) {
  return user?.username?.toLowerCase() === OWNER_USERNAME;
}

function orderItemsText(items) {
  if (!Array.isArray(items)) return "Заказ";
  return items.map(i => `• ${i.product} ×${i.qty}`).join("\n");
}

async function sendTelegram(chatId, text) {
  if (!BOT_TOKEN || !chatId) return;

  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

async function notifyAdmin(text) {
  await sendTelegram(ADMIN_CHAT_ID, text);
}

async function notifyCustomer(order, status) {
  const itemsText = orderItemsText(order.items);

  if (status === "несут") {
    await sendTelegram(
      order.user_id,
      🛵 Ваш заказ уже несут!\n\n${itemsText}\n\nОжидайте доставку в ближайшие минуты.
    );
  }

  if (status === "доставлен") {
    await sendTelegram(
      order.user_id,
      ✅ Заказ доставлен!\n\n${itemsText}\n\nСпасибо за заказ.
    );
  }

  if (status === "отменён") {
    await sendTelegram(
      order.user_id,
      ❌ Заказ отменён.\n\n${itemsText}\n\nЕсли это ошибка — напишите администратору @vicerapgod.
    );
  }
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return res({ ok: false, error: "POST only" });
    }

    const body = JSON.parse(event.body || "{}");
    const { action, user } = body;

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return res({ ok: false, error: "missing_supabase_env" });
    }

    if (action === "init") {
      const settings = await db("settings?select=*&order=id.asc&limit=1");
