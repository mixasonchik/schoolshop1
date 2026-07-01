exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const token = process.env.BOT_TOKEN;
  const chatId = process.env.ADMIN_CHAT_ID;
  if (!token || !chatId) return { statusCode: 200, body: JSON.stringify({ ok:false, note:'env vars missing' }) };
  const order = JSON.parse(event.body || '{}');
  const username = order.user?.username ? '@' + order.user.username : (order.user?.first_name || 'unknown');
  const items = (order.items || []).map(i => `• ${i.product} ×${i.qty}`).join('\n');
  const text = `🛍 Новый заказ SchoolShop\n\nПокупатель: ${username}\nШкафчик: ${order.floor} этаж, №${order.locker}\n\n${items}\n\nИтого: ${order.total || 0} ₽`;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ chat_id: chatId, text }) });
  return { statusCode: 200, body: JSON.stringify({ ok:true }) };
};
