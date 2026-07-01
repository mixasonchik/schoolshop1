exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const token = process.env.BOT_TOKEN;
  const chatId = process.env.ADMIN_CHAT_ID;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!token || !chatId || !supabaseUrl || !supabaseKey) {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: false, note: "env vars missing" })
    };
  }

  const order = JSON.parse(event.body || "{}");
  const user = order.user || {};
  const userId = user.id;
  const username = user.username || user.first_name || "unknown";
  const total = Number(order.total || 0);

  if (!userId) {
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: false, note: "no telegram user id" })
    };
  }

  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
    "Content-Type": "application/json"
  };

  let userRes = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${userId}&select=*`, {
    headers
  });

  let users = await userRes.json();
  let dbUser = users[0];

  if (!dbUser) {
    await fetch(`${supabaseUrl}/rest/v1/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        id: userId,
        username,
        balance: 0
      })
    });

    dbUser = { id: userId, username, balance: 0 };
  }

  if (dbUser.balance < total) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: false,
        reason: "not_enough_balance",
        balance: dbUser.balance,
        need: total
      })
    };
  }

  const newBalance = dbUser.balance - total;

  await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${userId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ balance: newBalance })
  });

  const buyer = user.username ? "@" + user.username : username;
  const items = (order.items || [])
    .map((i) => `• ${i.product} ×${i.qty}`)
    .join("\n");

  const text =
    `🛍 Новый заказ SchoolShop\n\n` +
    `Покупатель: ${buyer}\n` +
    `Шкафчик: ${order.floor} этаж, №${order.locker}\n\n` +
    `${items}\n\n` +
    `Итого: ${total} ₽\n` +
    `Баланс после заказа: ${newBalance} ₽`;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      charged: total,
      balance: newBalance
    })
  };
};