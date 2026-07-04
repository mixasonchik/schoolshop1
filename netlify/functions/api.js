const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE;
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const OWNER_USERNAME = "vicerapgod";

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
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

async function notifyCustomer(userId, status) {
  if (status === "несут") {
    await sendTelegram(userId, "🚴 Ваш заказ уже несут. Скоро будет у шкафчика.");
  }

  if (status === "доставлен") {
    await sendTelegram(userId, "✅ Ваш заказ доставлен в шкафчик.");
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
      const products = await db("products?is_active=eq.true&select=*&order=created_at.asc");

      let users = await db(`users?id=eq.${user.id}&select=*`);

      if (!users.length) {
        await db("users", {
          method: "POST",
          body: JSON.stringify({
            id: user.id,
            username: user.username || user.first_name || "unknown",
            balance: 0
          })
        });

        users = [{
          id: user.id,
          username: user.username || user.first_name || "unknown",
          balance: 0
        }];
      }

      const orders = await db(`orders?user_id=eq.${user.id}&select=*&order=created_at.desc`);

      return res({
        ok: true,
        owner: isOwner(user),
        settings: settings[0],
        products,
        profile: users[0],
        orders
      });
    }

    if (action === "createOrder") {
      const { floor, locker, items, total } = body;

      const users = await db(`users?id=eq.${user.id}&select=*`);
      const profile = users[0];

      if (!profile) return res({ ok: false, error: "user_not_found" });

      if (profile.balance < total) {
        return res({
          ok: false,
          reason: "not_enough_balance",
          balance: profile.balance,
          need: total
        });
      }

      for (const item of items) {
        const found = await db(`products?id=eq.${item.id}&select=*`);
        const product = found[0];

        if (!product || product.stock < item.qty) {
          return res({
            ok: false,
            reason: "out_of_stock",
            product: item.product
          });
        }
      }

      const newBalance = profile.balance - total;

      await db(`users?id=eq.${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ balance: newBalance })
      });

      for (const item of items) {
        const found = await db(`products?id=eq.${item.id}&select=*`);
        const product = found[0];

        await db(`products?id=eq.${item.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            stock: product.stock - item.qty
          })
        });
      }

      const inserted = await db("orders", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          user_id: user.id,
          username: user.username || user.first_name || "unknown",
          floor,
          locker,
          items,
          total,
          status: "новый"
        })
      });

      const orderText = items.map(i => `• ${i.product} ×${i.qty}`).join("\n");

      await notifyAdmin(
        `🛍 Новый заказ SchoolShop\n\n` +
        `Покупатель: @${user.username || user.first_name || "unknown"}\n` +
        `ID: ${user.id}\n` +
        `Шкафчик: ${floor} этаж, №${locker}\n\n` +
        `${orderText}\n\n` +
        `Итого: ${total} ₽\n` +
        `Баланс после: ${newBalance} ₽`
      );

      return res({
        ok: true,
        order: inserted[0],
        balance: newBalance,
        charged: total
      });
    }

    if (action === "listOrders") {
      if (!isOwner(user)) return res({ ok: false, error: "not_owner" });

      const orders = await db("orders?select=*&order=created_at.desc");
      return res({ ok: true, orders });
    }

    if (action === "updateOrderStatus") {
      if (!isOwner(user)) return res({ ok: false, error: "not_owner" });

      const { orderId, status } = body;

      const updated = await db(`orders?id=eq.${orderId}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ status })
      });

      const order = updated[0];

      if (order?.user_id && (status === "несут" || status === "доставлен")) {
        await notifyCustomer(order.user_id, status);
      }

      return res({ ok: true, order });
    }

    if (action === "updateOrderCourier") {
      if (!isOwner(user)) return res({ ok: false, error: "not_owner" });

      const { orderId, courierName } = body;

      const updated = await db(`orders?id=eq.${orderId}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          courier_name: courierName || ""
        })
      });

      return res({ ok: true, order: updated[0] });
    }

    if (action === "saveProduct") {
      if (!isOwner(user)) return res({ ok: false, error: "not_owner" });

      const p = body.product;

      await db("products?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify(p)
      });

      return res({ ok: true });
    }

    if (action === "deleteProduct") {
      if (!isOwner(user)) return res({ ok: false, error: "not_owner" });

      await db(`products?id=eq.${body.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: false })
      });

      return res({ ok: true });
    }

    if (action === "topup") {
      if (!isOwner(user)) return res({ ok: false, error: "not_owner" });

      const { userId, amount } = body;

      const rows = await db(`users?id=eq.${userId}&select=*`);
      if (!rows.length) return res({ ok: false, error: "user_not_found" });

      const newBalance = (rows[0].balance || 0) + Number(amount || 0);

      await db(`users?id=eq.${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ balance: newBalance })
      });

      await sendTelegram(userId, `💳 Баланс пополнен на ${amount} ₽.\nТекущий баланс: ${newBalance} ₽`);

      return res({ ok: true, balance: newBalance });
    }

    if (action === "updateSettings") {
      if (!isOwner(user)) return res({ ok: false, error: "not_owner" });

      const s = body.settings;

      await db("settings?id=eq.1", {
        method: "PATCH",
        body: JSON.stringify(s)
      });

      return res({ ok: true });
    }

    if (action === "report") {
      if (!isOwner(user)) return res({ ok: false, error: "not_owner" });

      const orders = await db("orders?select=*");
      const delivered = orders.filter(o => o.status === "доставлен");
      const revenue = delivered.reduce((sum, o) => sum + Number(o.total || 0), 0);

      const popular = {};

      for (const o of orders) {
        if (Array.isArray(o.items)) {
          for (const item of o.items) {
            popular[item.product] = (popular[item.product] || 0) + Number(item.qty || 0);
          }
        }
      }

      const topProducts = Object.entries(popular)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      return res({
        ok: true,
        totalOrders: orders.length,
        deliveredOrders: delivered.length,
        revenue,
        topProducts
      });
    }

    return res({ ok: false, error: "unknown_action" });

  } catch (e) {
    return res({ ok: false, error: String(e.message || e) });
  }
};