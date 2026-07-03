const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const OWNER_USERNAME = 'vicerapgod';

const user = tg?.initDataUnsafe?.user || {
  id: 1,
  username: 'demo',
  first_name: 'Demo'
};

let state = {
  cart: {},
  floor: '2',
  locker: '',
  products: [],
  orders: [],
  settings: null,
  profile: { balance: 0 },
  isOwner: false,
  allOrders: []
};

let toastTimer;

async function api(action, data = {}) {
  const res = await fetch('/.netlify/functions/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, user, ...data })
  });

  return await res.json();
}

function toast(msg, opts = {}) {
  const el = document.getElementById('toast');
  const text = document.getElementById('toastText');
  const action = document.getElementById('toastAction');

  text.textContent = msg;
  action.style.display = opts.topup ? 'inline-flex' : 'none';
  action.onclick = () => window.open('https://t.me/vicerapgod', '_blank');

  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 9000);
}

function money(v) {
  return `${Number(v || 0)} ₽`;
}

function formatTime(h, m) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function isOpen() {
  const s = state.settings || {
    open_hour: 8,
    open_minute: 50,
    close_hour: 11,
    close_minute: 20
  };

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Moscow',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false
  }).formatToParts(new Date());

  const h = +parts.find(p => p.type === 'hour').value;
  const m = +parts.find(p => p.type === 'minute').value;
  const now = h * 60 + m;

  const open = s.open_hour * 60 + s.open_minute;
  const close = s.close_hour * 60 + s.close_minute;

  return now >= open && now < close;
}

function updateStatus() {
  const s = state.settings || {
    open_hour: 8,
    open_minute: 50,
    close_hour: 11,
    close_minute: 20
  };

  const open = isOpen();
  const badge = document.getElementById('statusBadge');
  const text = document.getElementById('timeText');

  badge.textContent = open ? 'OPEN' : 'CLOSED';
  badge.classList.toggle('closed', !open);

  text.innerHTML = open
    ? `Предзаказы открыты до ${formatTime(s.close_hour, s.close_minute)}.`
    : `Заказы на сегодня закончились. Откроемся завтра в <b>${formatTime(s.open_hour, s.open_minute)}</b>.`;
}

function productImage(p, cls = '') {
  return `
    <div class="product-img ${cls}">
      <img src="${p.image || 'assets/dubai.png'}" alt="${p.name}">
    </div>
  `;
}

function renderHero() {
  const hero = state.products.find(p => p.is_hit) || state.products[0];
  const box = document.getElementById('heroProduct');

  if (!hero) {
    box.innerHTML = `<div class="muted">Товары пока не добавлены.</div>`;
    return;
  }

  box.innerHTML = `
    <div class="hero-photo white-photo">
      <img src="${hero.image || 'assets/dubai.png'}" alt="${hero.name}" />
    </div>
    <div class="product-info">
      <div class="tag">ХИТ</div>
      <h3>${hero.name}</h3>
      <p>Быстрая доставка прямо в шкафчик. Получение — на ближайшей перемене.</p>
      <div class="price">${hero.price ? money(hero.price) : 'Цена позже'}</div>
      <button data-add="${hero.id}" class="primary primary-blue">В корзину</button>
    </div>
  `;

  box.querySelector('[data-add]').onclick = () => addToCart(hero.id);
}

function renderProducts() {
  const grid = document.getElementById('productGrid');

  grid.innerHTML = state.products.map(p => {
    const low = p.stock > 0 && p.stock <= 3;
    const ended = p.stock <= 0;

    return `
      <div class="mini-card">
        ${p.is_hit ? `<div class="badge hit-badge">🔥 Хит</div>` : ''}
        ${productImage(p, 'mini-img')}
        <div class="mini-body">
          <div class="mini-price">
            ${p.price ? money(p.price) : 'Цена позже'}
            ${p.old_price ? `<span class="mini-old">${money(p.old_price)}</span>` : ''}
          </div>
          <div class="mini-name">${p.name}</div>
          ${low ? `<div class="stock-low">Осталось ${p.stock} шт.</div>` : ''}
          <button data-add="${p.id}" ${ended ? 'disabled' : ''}>
            ${ended ? 'Закончилось' : 'В корзину'}
          </button>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('[data-add]').forEach(btn => {
    btn.onclick = () => addToCart(btn.dataset.add);
  });
}

function addToCart(id) {
  const p = state.products.find(x => x.id === id);
  if (!p) return;
  if (p.stock <= 0) return toast('Товар закончился');

  state.cart[id] = (state.cart[id] || 0) + 1;
  renderCart();
  toast('Добавлено в корзину');
}

function cartItems() {
  return Object.entries(state.cart)
    .map(([id, qty]) => {
      const p = state.products.find(x => x.id === id);
      if (!p) return null;
      return { ...p, qty };
    })
    .filter(Boolean);
}

function cartTotal() {
  return cartItems().reduce((sum, p) => sum + Number(p.price || 0) * p.qty, 0);
}

function renderCart() {
  const list = document.getElementById('cartList');
  const items = cartItems();

  if (!items.length) {
    list.innerHTML = `<div class="cart-item empty-cart">Корзина пока пустая. Добавь товар на главной.</div>`;
  } else {
    list.innerHTML = items.map(p => `
      <div class="cart-item">
        <div class="cart-thumb">
          <img src="${p.image || 'assets/dubai.png'}" alt="${p.name}">
        </div>
        <div class="cart-info">
          <b>${p.name}</b><br>
          <span class="muted">${money(p.price)} × ${p.qty}</span>
        </div>
        <div class="qty">
          <button data-minus="${p.id}">−</button>
          <b>${p.qty}</b>
          <button data-plus="${p.id}">+</button>
        </div>
      </div>
    `).join('');
  }

  document.querySelectorAll('[data-plus]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.plus;
      const p = state.products.find(x => x.id === id);
      if (p && state.cart[id] >= p.stock) return toast('Больше нет в наличии');
      state.cart[id]++;
      renderCart();
    };
  });

  document.querySelectorAll('[data-minus]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.dataset.minus;
      state.cart[id]--;
      if (state.cart[id] <= 0) delete state.cart[id];
      renderCart();
    };
  });

  document.getElementById('cartTotal').innerHTML = `${cartTotal()} <span class="rub">₽</span>`;
  document.getElementById('lockerInput').value = state.locker || '';

  document.querySelectorAll('.floor').forEach(f => {
    f.classList.toggle('active', f.dataset.floor === state.floor);
  });
}

function renderProfile() {
  document.getElementById('profileLocker').textContent = state.locker
    ? `${state.floor} этаж · ${state.locker}`
    : 'не указан';

  document.getElementById('profileBalance').textContent = money(state.profile?.balance || 0);

  const h = document.getElementById('orderHistory');

  h.innerHTML = state.orders.length
    ? state.orders.map(o => {
      const items = Array.isArray(o.items)
        ? o.items.map(i => `${i.product} ×${i.qty}`).join(', ')
        : 'товары';

      const statusText = o.status === 'несут'
        ? 'Курьер несёт заказ, скоро будет'
        : o.status;

      return `
        <div class="history-item">
          <b>${new Date(o.created_at).toLocaleString('ru-RU')}</b><br>
          ${items}<br>
          ${o.floor} этаж, шкафчик ${o.locker} · ${statusText}
        </div>
      `;
    }).join('')
    : `<div class="history-item">Заказов пока нет.</div>`;
}

async function placeOrder() {
  const items = cartItems();
  if (!items.length) return toast('Корзина пустая');

  const locker = document.getElementById('lockerInput').value.trim();
  if (!locker) return toast('Укажи номер шкафчика');

  state.locker = locker;

  const orderItems = items.map(p => ({
    id: p.id,
    product: p.name,
    qty: p.qty
  }));

  const total = cartTotal();

  const result = await api('createOrder', {
    floor: state.floor,
    locker,
    items: orderItems,
    total
  });

  if (!result.ok && result.reason === 'not_enough_balance') {
    state.profile.balance = result.balance || 0;
    renderProfile();

    const missing = Math.max(0, total - state.profile.balance);
    return toast(`Недостаточно средств, баланс: ${state.profile.balance}₽. Пополните баланс на ${missing}₽`, { topup: true });
  }

  if (!result.ok) {
    return toast('Заказ не оформлен: ' + (result.error || JSON.stringify(result)));
  }

  state.profile.balance = result.balance;
  state.cart = {};
  await initApp();

  toast(`Заказ оформлен, ${result.charged}₽ списано с вашего счета`, { topup: true });
}

function renderCourier() {
  const box = document.getElementById('courierOrders');
  if (!box) return;

  const active = state.allOrders?.filter(o => o.status === 'новый' || o.status === 'несут') || [];

  box.innerHTML = active.length ? active.map(o => {
    const items = Array.isArray(o.items)
      ? o.items.map(i => `${i.product} ×${i.qty}`).join(', ')
      : 'товары';

    return `
      <div class="admin-card">
        <b>Заказ #${o.id}</b>
        <p>${items}</p>
        <p>${o.floor} этаж · шкафчик ${o.locker}</p>
        <p class="muted">Статус: ${o.status}</p>
        <button data-status="${o.id}:несут" class="secondary">Несу заказ</button>
        <button data-status="${o.id}:доставлен" class="primary small-primary">Доставлено</button>
      </div>
    `;
  }).join('') : `<div class="history-item">Активных заказов нет.</div>`;

  box.querySelectorAll('[data-status]').forEach(btn => {
    btn.onclick = async () => {
      const [orderId, status] = btn.dataset.status.split(':');
      await api('updateOrderStatus', { orderId, status });
      toast(status === 'несут' ? 'Статус: курьер несёт заказ' : 'Заказ доставлен');
      await loadOwnerData();
    };
  });
}

function renderAdminOrders() {
  const box = document.getElementById('adminOrders');
  if (!box) return;

  const orders = state.allOrders || [];

  box.innerHTML = orders.length ? orders.map(o => {
    const items = Array.isArray(o.items)
      ? o.items.map(i => `${i.product} ×${i.qty}`).join(', ')
      : 'товары';

    return `
      <div class="admin-card">
        <b>#${o.id} · ${o.status}</b>
        <p>@${o.username || 'unknown'} · ${o.floor} этаж · шкафчик ${o.locker}</p>
        <p>${items}</p>
        <p>Итого: ${money(o.total)}</p>
        <input data-courier="${o.id}" placeholder="Имя курьера (только для админа)" value="${o.courier_name || ''}">
        <button data-admin-status="${o.id}:несут" class="secondary">Несу заказ</button>
        <button data-admin-status="${o.id}:доставлен" class="primary small-primary">Доставлен</button>
        <button data-admin-status="${o.id}:отменён" class="danger">Отменить</button>
      </div>
    `;
  }).join('') : `<div class="history-item">Заказов нет.</div>`;

  box.querySelectorAll('[data-admin-status]').forEach(btn => {
    btn.onclick = async () => {
      const [orderId, status] = btn.dataset.adminStatus.split(':');
      await api('updateOrderStatus', { orderId, status });
      toast('Статус обновлён');
      await loadOwnerData();
    };
  });

  box.querySelectorAll('[data-courier]').forEach(input => {
    input.onchange = async () => {
      await api('updateOrderCourier', {
        orderId: input.dataset.courier,
        courierName: input.value
      });
      toast('Имя курьера сохранено');
    };
  });
}

function renderReport(report) {
  const box = document.getElementById('reportBox');
  if (!box || !report) return;

  box.innerHTML = `
    <div>Всего заказов: <b>${report.totalOrders}</b></div>
    <div>Доставлено: <b>${report.deliveredOrders}</b></div>
    <div>Выручка: <b>${money(report.revenue)}</b></div>
  `;
}

async function loadOwnerData() {
  if (!state.isOwner) return;

  const orders = await api('listOrders');
  state.allOrders = orders.orders || [];

  renderCourier();
  renderAdminOrders();

  const report = await api('report');
  if (report.ok) renderReport(report);
}

function fillAdminSettings() {
  const s = state.settings || {};
  document.getElementById('openHour').value = s.open_hour ?? 8;
  document.getElementById('openMinute').value = s.open_minute ?? 50;
  document.getElementById('closeHour').value = s.close_hour ?? 11;
  document.getElementById('closeMinute').value = s.close_minute ?? 20;
}

function setupAdmin() {
  if (!state.isOwner) return;

  document.querySelector('.admin-tab')?.classList.remove('hidden');
  document.querySelector('.courier-tab')?.classList.remove('hidden');

  fillAdminSettings();

  document.getElementById('refreshReport').onclick = loadOwnerData;

  document.getElementById('saveSettings').onclick = async () => {
    await api('updateSettings', {
      settings: {
        open_hour: Number(document.getElementById('openHour').value),
        open_minute: Number(document.getElementById('openMinute').value),
        close_hour: Number(document.getElementById('closeHour').value),
        close_minute: Number(document.getElementById('closeMinute').value)
      }
    });
    toast('Время работы сохранено');
    await initApp();
  };

  document.getElementById('topupBtn').onclick = async () => {
    const userId = document.getElementById('topupUserId').value.trim();
    const amount = document.getElementById('topupAmount').value.trim();

    const r = await api('topup', { userId, amount });
    toast(r.ok ? `Баланс пополнен: ${money(r.balance)}` : 'Ошибка пополнения: ' + (r.error || JSON.stringify(r)));
  };

  document.getElementById('saveProduct').onclick = async () => {
    const product = {
      id: document.getElementById('productId').value.trim(),
      name: document.getElementById('productName').value.trim(),
      price: Number(document.getElementById('productPrice').value || 0),
      old_price: Number(document.getElementById('productOldPrice').value || 0) || null,
      image: document.getElementById('productImage').value.trim(),
      stock: Number(document.getElementById('productStock').value || 0),
      is_hit: document.getElementById('productHit').value.trim().toLowerCase() === 'true',
      is_active: true
    };

    if (!product.id || !product.name) return toast('Укажи ID и название товара');

    const r = await api('saveProduct', { product });
    toast(r.ok ? 'Товар сохранён' : 'Ошибка сохранения: ' + (r.error || JSON.stringify(r)));
    await initApp();
  };

  document.getElementById('deleteProduct').onclick = async () => {
    const id = document.getElementById('productId').value.trim();
    if (!id) return toast('Укажи ID товара');

    const r = await api('deleteProduct', { id });
    toast(r.ok ? 'Товар скрыт' : 'Ошибка удаления: ' + (r.error || JSON.stringify(r)));
    await initApp();
  };

  loadOwnerData();
}

async function initApp() {
  try {
    const data = await api('init');

    if (!data.ok) {
      toast('Ошибка: ' + (data.error || JSON.stringify(data)));
      return;
    }

    state.isOwner = data.owner;
    state.settings = data.settings;
    state.products = data.products || [];
    state.profile = data.profile || { balance: 0 };
    state.orders = data.orders || [];

    renderHero();
    renderProducts();
    renderCart();
    renderProfile();
    updateStatus();
    setupAdmin();
  } catch (e) {
    console.error(e);
    toast('Ошибка сервера: ' + (e.message || JSON.stringify(e)));
  }
}

document.querySelectorAll('.tab').forEach(t => {
  t.onclick = () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');

    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(t.dataset.tab).classList.add('active');

    renderCart();
    renderProfile();

    if (t.dataset.tab === 'admin' || t.dataset.tab === 'courier') {
      loadOwnerData();
    }
  };
});

document.querySelectorAll('.floor').forEach(f => {
  f.onclick = () => {
    state.floor = f.dataset.floor;
    renderCart();
  };
});

document.getElementById('placeOrder').onclick = placeOrder;

setInterval(updateStatus, 60000);
initApp();