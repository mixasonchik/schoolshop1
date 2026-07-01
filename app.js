const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const OPEN_HOUR = 8, OPEN_MINUTE = 50, CLOSE_HOUR = 11, CLOSE_MINUTE = 20;
const user = tg?.initDataUnsafe?.user || { id: 'demo', username: 'demo', first_name: 'Demo' };
const storageKey = `schoolshop_${user.id}`;

const products = [
  {id:'dubai', name:'Дубайский шоколад', price:null, label:'🔥 Хит', image:'assets/dubai.png', hero:true},
  {id:'franui-milk', name:'Малина Franui, в белом шоколаде', price:929, old:1299, label:'🔥 Хит', image:'assets/franui_milk.png'},
  {id:'buckwheat-milk', name:'Гречишный молочный шоколад', price:269, old:354, label:null, image:'assets/buckwheat_milk.png'},
  {id:'buckwheat-dark', name:'Гречишный горький шоколад', price:269, old:354, label:null, image:'assets/buckwheat_dark.png'}
];

let state = JSON.parse(localStorage.getItem(storageKey) || '{}');
state.cart ||= {};
state.orders ||= [];
state.floor ||= '2';
state.locker ||= '';

function save(){ localStorage.setItem(storageKey, JSON.stringify(state)); }
let toastTimer;
function toast(msg, opts={}){
  const el=document.getElementById('toast');
  const text=document.getElementById('toastText');
  const action=document.getElementById('toastAction');
  text.textContent=msg;
  action.style.display=opts.topup ? 'inline-flex' : 'none';
  action.onclick=()=>{
    document.querySelector('[data-tab="profile"]').click();
    toast('Пополнение: переведи администратору и напиши @SchoolShop', {});
  };
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.classList.remove('show'),5000);
}
function isOpen(){
  const parts = new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Moscow',hour:'numeric',minute:'numeric',hour12:false}).formatToParts(new Date());
  const h=+parts.find(p=>p.type==='hour').value;
  const m=+parts.find(p=>p.type==='minute').value;
  const now=h*60+m;
  return now>=OPEN_HOUR*60+OPEN_MINUTE && now<CLOSE_HOUR*60+CLOSE_MINUTE;
}
function updateStatus(){
  const open=isOpen();
  document.getElementById('statusBadge').textContent=open?'OPEN':'CLOSED';
  document.getElementById('statusBadge').classList.toggle('closed',!open);
  document.getElementById('timeText').innerHTML=open?'Предзаказы открыты до 11:20.':'Заказы на сегодня закончились. Откроемся завтра в <b>8:50</b>.';
}
function productImage(p, cls=''){
  return `<div class="product-img ${p.white?'white-bg':''} ${cls}"><img src="${p.image}" alt="${p.name}"></div>`;
}
function renderProducts(){
  const grid=document.getElementById('productGrid');
  grid.innerHTML=products.map(p=>`
    <div class="mini-card">
      ${p.label?`<div class="badge hit-badge">${p.label}</div>`:''}
      ${productImage(p,'mini-img')}
      <div class="mini-body">
        <div class="mini-price">${p.price? p.price+' ₽'+(p.old?' <span class="mini-old">'+p.old+' ₽</span>':''):'Цена позже'}</div>
        <div class="mini-name">${p.name}</div>
        <button data-add="${p.id}">В корзину</button>
      </div>
    </div>`).join('');
  grid.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>addToCart(b.dataset.add));
}
function addToCart(id){
  state.cart[id]=(state.cart[id]||0)+1;
  save();
  renderCart();
  toast('Добавлено в корзину');
}
function renderCart(){
  const list=document.getElementById('cartList');
  const items=Object.entries(state.cart);
  if(!items.length){
    list.innerHTML='<div class="cart-item empty-cart">Корзина пока пустая. Добавь товар на главной.</div>';
  } else {
    list.innerHTML=items.map(([id,qty])=>{
      const p=products.find(x=>x.id===id);
      return `<div class="cart-item">
        <div class="cart-thumb ${p.white?'white-bg':''}"><img src="${p.image}" alt="${p.name}"></div>
        <div class="cart-info"><b>${p.name}</b><br><span class="muted">${p.price? p.price+' ₽':'Цена позже'} × ${qty}</span></div>
        <div class="qty"><button data-minus="${id}">−</button><b>${qty}</b><button data-plus="${id}">+</button></div>
      </div>`
    }).join('');
  }
  document.querySelectorAll('[data-plus]').forEach(b=>b.onclick=()=>{state.cart[b.dataset.plus]++;save();renderCart()});
  document.querySelectorAll('[data-minus]').forEach(b=>b.onclick=()=>{state.cart[b.dataset.minus]--; if(state.cart[b.dataset.minus]<=0) delete state.cart[b.dataset.minus]; save(); renderCart()});
  const total=items.reduce((s,[id,q])=>s+((products.find(p=>p.id===id).price||0)*q),0);
  document.getElementById('cartTotal').innerHTML=total+' <span class="rub">₽</span>';
  document.getElementById('lockerInput').value=state.locker||'';
  document.querySelectorAll('.floor').forEach(f=>f.classList.toggle('active',f.dataset.floor===state.floor));
}
function renderProfile(){
  document.getElementById('profileLocker').textContent=state.locker?`${state.floor} этаж · ${state.locker}`:'не указан';
  const h=document.getElementById('orderHistory');
  h.innerHTML=state.orders.length?state.orders.slice().reverse().map(o=>`<div class="history-item"><b>${o.date}</b><br>${o.items}<br>${o.address} · ${o.status}</div>`).join(''):'<div class="history-item">Заказов пока нет.</div>';
}
async function placeOrder(){
  const items=Object.entries(state.cart);
  if(!items.length) return toast('Корзина пустая');
  const locker=document.getElementById('lockerInput').value.trim();
  if(!locker) return toast('Укажи номер шкафчика');
  state.locker=locker;
  save();
  const order={
    user,
    floor:state.floor,
    locker,
    items:items.map(([id,qty])=>({product:products.find(p=>p.id===id).name, qty})),
    total:items.reduce((s,[id,q])=>s+((products.find(p=>p.id===id).price||0)*q),0)
  };
  try{
    await fetch('/.netlify/functions/create-order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(order)});
  }catch(e){}
  state.orders.push({date:new Date().toLocaleString('ru-RU'), items:order.items.map(i=>`${i.product} ×${i.qty}`).join(', '), address:`${state.floor} этаж, шкафчик ${locker}`, status:'отправлен'});
  state.cart={};
  save();
  renderCart();
  renderProfile();
  toast(`Заказ оформлен, ${order.total}₽ списано с вашего счета`, {topup:true});
}
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(t.dataset.tab).classList.add('active');
  renderCart();
  renderProfile();
});
document.querySelectorAll('.floor').forEach(f=>f.onclick=()=>{state.floor=f.dataset.floor;save();renderCart()});
document.getElementById('placeOrder').onclick=placeOrder;
document.getElementById('quickReserve').onclick=()=>{addToCart('dubai'); document.querySelector('[data-tab="cart"]').click();};
renderProducts(); renderCart(); renderProfile(); updateStatus(); setInterval(updateStatus,60000);
