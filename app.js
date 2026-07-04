const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

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
  return ${Number(v || 0)} ₽;
}

function formatTime(h, m) {
  return ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')};
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
    ? Предзаказы открыты до ${formatTime(s.close_hour, s.close_minute)}.
    : Заказы на сегодня закончились. Откроемся завтра в <b>${formatTime(s.open_hour, s.open_minute)}</b>.;
}

function renderHero() {
  const heroId = state.settings?.hero_product_id;
  const hero =
    state.products.find(p => p.id === heroId) ||
    state.products.find(p => p.is_hit) ||
    state.products[0];

  const box = document.getElementById('heroProduct');

  if (!box) return;

  if (!hero) {
    box.innerHTML = <div class="muted">Товары пока не добавлены.</div>;
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
  if (!grid) return;

  grid.innerHTML = state.products.map(p => {
    const low = p.stock > 0 && p.stock <= 3;
    const ended = p.stock <= 0;

    return `
      <div class="mini-card">
        ${p.is_hit ? <div class="badge hit-badge">🔥 Хит</div> : ''}
        <div class="product-img mini-img">
          <img src="${p.image || 'assets/dubai.png'}" alt="${p.name}">
        </div>
        <div class="mini-body">
          <div class="mini-price">
            ${p.price ? money(p.price) : 'Цена позже'}
            ${p.old_price ? <span class="mini-old">${money(p.old_price)}</span> : ''}
          </div>
