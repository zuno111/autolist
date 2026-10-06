'use strict';
// AutoList 프론트엔드 (고딕 전용, 이탤릭 없음)
let STATE = null;
let TOKENS = { access: localStorage.getItem('al_access'), refresh: localStorage.getItem('al_refresh') };
let PAGE = 'dashboard';

function $(s, r = document) { return r.querySelector(s); }
function el(tag, attrs = {}, html) { const e = document.createElement(tag); Object.assign(e, attrs); if (html != null) e.innerHTML = html; return e; }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function toast(msg, kind) { const t = $('#toast'); t.innerHTML = `<div class="toast ${kind || ''}">${esc(msg)}</div>`; setTimeout(() => t.innerHTML = '', 4200); }
function onErr(e) { toast(e.message, 'err'); if (e.data && e.data.upgrade) setTimeout(() => go('billing'), 900); }
function toggleDrawer() { document.body.classList.toggle('drawer-open'); }
function closeDrawer() { document.body.classList.remove('drawer-open'); }

async function api(path, opts = {}) {
  opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  if (TOKENS.access) opts.headers.Authorization = 'Bearer ' + TOKENS.access;
  if (opts.body && typeof opts.body !== 'string' && !(opts.body instanceof FormData)) opts.body = JSON.stringify(opts.body);
  if (opts.body instanceof FormData) delete opts.headers['Content-Type'];
  let res = await fetch(path, opts);
  if (res.status === 401 && TOKENS.refresh && path !== '/api/auth/refresh') {
    const ok = await tryRefresh();
    if (ok) { opts.headers.Authorization = 'Bearer ' + TOKENS.access; res = await fetch(path, opts); }
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(data.error || ('오류 ' + res.status)); err.data = data; err.status = res.status; throw err; }
  if (data.state) STATE = data.state;
  return data;
}
async function tryRefresh() {
  try {
    const r = await fetch('/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: TOKENS.refresh }) });
    const d = await r.json();
    if (d.ok) { setTokens(d.access, d.refresh); if (d.state) STATE = d.state; return true; }
  } catch (_) {}
  setTokens(null, null); return false;
}
function setTokens(a, r) {
  TOKENS = { access: a, refresh: r };
  if (a) { localStorage.setItem('al_access', a); localStorage.setItem('al_refresh', r); }
  else { localStorage.removeItem('al_access'); localStorage.removeItem('al_refresh'); }
}

// ===== 인증 =====
function toggleAuth(which) { $('#loginForm').classList.toggle('hidden', which !== 'login'); $('#registerForm').classList.toggle('hidden', which !== 'register'); }
async function doLogin() {
  try { const d = await api('/api/auth/login', { method: 'POST', body: { email: $('#loginEmail').value, password: $('#loginPw').value } });
    setTokens(d.access, d.refresh); STATE = d.state; enterApp();
  } catch (e) { onErr(e); }
}
async function doRegister() {
  try { const d = await api('/api/auth/register', { method: 'POST', body: { name: $('#regName').value, email: $('#regEmail').value, password: $('#regPw').value, plan: $('#regPlan').value } });
    setTokens(d.access, d.refresh); STATE = d.state;
    const s = d.state.billing.sub;
    toast(s && s.status === 'trialing' ? `가입 완료. ${s.plan} ${s.trialDaysLeft}일 무료 체험 시작` : '가입 완료. 환영합니다', 'ok'); enterApp();
  } catch (e) { onErr(e); }
}
function doLogout() { setTokens(null, null); STATE = null; location.reload(); }

function enterApp() {
  $('#authView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  $('#navSellers').style.display = STATE.me.role === 'admin' ? 'block' : 'none';
  $('#meInfo').innerHTML = `${esc(STATE.me.name)}<br><span class="muted">${esc(STATE.me.email)} · ${STATE.me.role === 'admin' ? '관리자' : '셀러(' + STATE.me.plan + ')'}</span>`;
  $('#nav').querySelectorAll('button').forEach(b => b.onclick = () => { go(b.dataset.page); closeDrawer(); });
  updateNotifBadge();
  go('dashboard');
}
function go(page) {
  PAGE = page;
  $('#nav').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  render();
}

// ===== 렌더 =====
function render() {
  const m = $('#main');
  if (PAGE === 'dashboard') { m.innerHTML = viewDashboard(); loadDashboard(); }
  else if (PAGE === 'alerts') { m.innerHTML = viewAlerts(); loadAlerts(); }
  else if (PAGE === 'products') { m.innerHTML = viewProducts(); renderBulkBar(); }
  else if (PAGE === 'add') { m.innerHTML = viewAdd(); bindAdd(); }
  else if (PAGE === 'upload') m.innerHTML = viewUpload();
  else if (PAGE === 'inventory') m.innerHTML = viewInventory();
  else if (PAGE === 'shipping') { m.innerHTML = viewShipping(); loadShipping(); }
  else if (PAGE === 'pricing') { m.innerHTML = viewPricing(); loadPricing(); }
  else if (PAGE === 'sourcing') m.innerHTML = viewSourcing();
  else if (PAGE === 'pending') { m.innerHTML = viewPending(); loadPending(); }
  else if (PAGE === 'automation') { m.innerHTML = viewAutomation(); loadSchedules(); }
  else if (PAGE === 'competitors') { m.innerHTML = viewCompetitors(); loadCompetitors(); }
  else if (PAGE === 'sales') { m.innerHTML = viewSales(); loadSales(); }
  else if (PAGE === 'reviews') { m.innerHTML = viewReviews(); loadReviews(); }
  else if (PAGE === 'profit') { m.innerHTML = viewProfit(); loadProfit(); }
  else if (PAGE === 'billing') m.innerHTML = viewBilling();
  else if (PAGE === 'settings') m.innerHTML = viewSettings();
  else if (PAGE === 'sellers') m.innerHTML = viewSellers();
}

function viewDashboard() {
  const b = STATE.billing;
  const planLine = b.isAdmin ? ' <span class="pill ok">무료·무제한</span>' : (b.sub && b.sub.status === 'trialing' ? ` <span class="pill warn">체험 ${b.sub.trialDaysLeft}일 남음</span>` : '') + ` <a href="#" onclick="go('billing');return false">요금제 보기</a>`;
  return `
  <h1>대시보드</h1>
  <p class="sub">셀러 운영 전 과정을 한 곳에서. 현재 요금제: <b>${esc(b.planLabel)}</b>${planLine}</p>
  <div id="dashBody"><p class="muted">집계 중...</p></div>`;
}
async function loadDashboard() {
  try { const d = await api('/api/dashboard'); renderDashboard(d.summary); }
  catch (e) { onErr(e); }
}
function renderDashboard(s) {
  const body = $('#dashBody'); if (!body) return;
  const todoKindColor = { needfix: 'var(--err)', lowstock: 'var(--warn)', review: 'var(--warn)', negative: 'var(--err)' };
  body.innerHTML = `
  <div class="grid3">
    <div class="stat"><div class="n">${s.products}</div><div class="l">등록 상품 (준비 ${s.ready}/보완 ${s.needFix})</div></div>
    <div class="stat"><div class="n" style="color:var(--accent)">₩${(s.revenue30 || 0).toLocaleString()}</div><div class="l">30일 매출 (주문 ${s.orders30})</div></div>
    <div class="stat"><div class="n" style="color:${s.net30 >= 0 ? 'var(--ok)' : 'var(--err)'}">₩${(s.net30 || 0).toLocaleString()}</div><div class="l">30일 순이익</div></div>
  </div>
  <div class="grid3">
    <div class="stat"><div class="n ${s.lowStock ? 'result-no' : ''}">${s.lowStock}</div><div class="l">재고 부족 (≤${s.lowThreshold})</div></div>
    <div class="stat"><div class="n">${s.avgRating || 0}★</div><div class="l">평균 별점 (리뷰 ${s.reviews})</div></div>
    <div class="stat"><div class="n result-no">${s.negative}</div><div class="l">부정리뷰 · 미답변 ${s.unanswered}</div></div>
  </div>
  <div class="card">
    <h3>할 일 ${s.todos.length ? `<span class="pill no">${s.todos.length}</span>` : '<span class="pill ok">0</span>'}</h3>
    ${s.todos.length ? s.todos.map(t => `<div style="padding:8px 0;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center">
      <span><span class="pill" style="background:${todoKindColor[t.kind] || 'var(--panel2)'};color:#fff">!</span> ${esc(t.label)}</span>
      <button class="btn-ghost" onclick="go('${t.page}')">처리</button></div>`).join('') : '<p class="muted">처리할 일이 없습니다. 깔끔하네요.</p>'}
    <div style="margin-top:12px">
      <button class="btn-primary" onclick="go('add')">상품 추가</button>
      <button class="btn-blue" onclick="go('upload')">업로드</button>
      <button class="btn-ghost" onclick="go('competitors')">경쟁 분석</button>
    </div>
  </div>
  <div class="card"><h3>최근 알림 ${s.unread ? `<span class="pill no">${s.unread}</span>` : ''}</h3>
    ${s.alerts.length ? s.alerts.map(a => `<div style="padding:6px 0;border-bottom:1px solid var(--line)"><span class="muted">${new Date(a.at).toLocaleString('ko-KR')}</span> · ${esc(a.msg)}</div>`).join('') + `<div style="margin-top:8px"><button class="btn-ghost" onclick="go('alerts')">알림 전체 보기</button></div>` : '<p class="muted">알림이 없습니다.</p>'}
  </div>`;
}

function viewAlerts() {
  return `<h1>알림</h1><p class="sub">가격 변동·부정리뷰·재고 부족 알림을 한곳에서. 폰 알림을 켜면 앱을 닫아도 푸시로 받습니다.</p>
  <div class="tabbar">
    <button class="btn-primary" onclick="enablePush()">폰 알림 켜기</button>
    <button class="btn-ghost" onclick="testPush()">테스트 알림</button>
    <button class="btn-ghost" onclick="markRead()">모두 읽음</button>
    <button class="btn-danger" onclick="clearAlerts()">모두 지우기</button>
  </div>
  <div id="pushStatus" class="muted" style="margin-bottom:10px"></div>
  <div id="alertsBody"><p class="muted">불러오는 중...</p></div>`;
}
function urlB64ToUint8(base64) {
  const pad = '='.repeat((4 - base64.length % 4) % 4);
  const b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64); const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
async function enablePush() {
  const st = $('#pushStatus');
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { toast('이 브라우저는 푸시를 지원하지 않습니다', 'err'); return; }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('알림 권한이 거부되었습니다', 'err'); return; }
    const keyRes = await api('/api/push/key');
    if (!keyRes.publicKey) { if (st) st.textContent = '서버에 VAPID 키가 없어 데모 모드입니다. (배포 시 키 설정하면 실제 푸시 발송)'; }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyRes.publicKey ? urlB64ToUint8(keyRes.publicKey) : undefined });
    await api('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON ? sub.toJSON() : sub } });
    toast('폰 알림이 켜졌습니다', 'ok');
    if (st) st.textContent = '폰 알림 구독 완료. 부정리뷰·재고부족·경쟁가 하락 시 푸시로 받습니다.';
  } catch (e) { toast('푸시 설정 실패: ' + e.message, 'err'); }
}
async function testPush() {
  try { const r = await api('/api/push/test', { method: 'POST', body: {} });
    toast(r.sent ? `테스트 푸시 발송(${r.sent}건)` : (r.mock ? '구독됨(서버 VAPID 키 없어 실제 발송은 배포 후)' : '구독 먼저 "폰 알림 켜기"'), r.sent ? 'ok' : '');
  } catch (e) { onErr(e); }
}
async function loadAlerts() {
  try { const d = await api('/api/alerts'); const box = $('#alertsBody'); if (!box) return;
    box.innerHTML = d.alerts.length ? `<div class="card">${d.alerts.map(a => {
      const col = a.type === 'bad_review' ? 'var(--err)' : a.type === 'low_stock' ? 'var(--warn)' : a.type === 'repriced' ? 'var(--ok)' : 'var(--accent2)';
      const label = { bad_review: '부정리뷰', low_stock: '재고부족', repriced: '자동조정', price_drop: '가격하락' }[a.type] || '알림';
      return `<div style="padding:8px 0;border-bottom:1px solid var(--line)"><span class="pill" style="background:${col};color:#fff">${label}</span> ${esc(a.msg)} <span class="muted">${new Date(a.at).toLocaleString('ko-KR')}</span></div>`;
    }).join('')}</div>` : '<div class="card"><p class="muted">알림이 없습니다.</p></div>';
    await api('/api/alerts/read', { method: 'POST', body: {} }); updateNotifBadge();
  } catch (e) { onErr(e); }
}
async function markRead() { try { await api('/api/alerts/read', { method: 'POST', body: {} }); toast('모두 읽음 처리', 'ok'); updateNotifBadge(); } catch (e) { onErr(e); } }
async function clearAlerts() { if (!confirm('모든 알림을 지울까요?')) return; try { await api('/api/alerts/clear', { method: 'POST', body: {} }); toast('알림 삭제', 'ok'); loadAlerts(); updateNotifBadge(); } catch (e) { onErr(e); } }
function updateNotifBadge() {
  const n = (STATE && STATE.notif && STATE.notif.unread) || 0;
  const btn = document.querySelector('#nav button[data-page="alerts"]');
  if (btn) btn.innerHTML = '알림' + (n ? ` <span class="pill no">${n}</span>` : '');
  const tb = document.getElementById('tbAlerts');
  if (tb) tb.innerHTML = '알림' + (n ? ` <span class="pill no">${n}</span>` : '');
}

let PROD_SEARCH = '';
const SELECTED = new Set();
function viewProducts() {
  let p = STATE.products;
  const q = PROD_SEARCH.trim().toLowerCase();
  if (q) p = p.filter(x => (x.sku + ' ' + (x.title || '') + ' ' + (x.title_en || '') + ' ' + (x.brand || '')).toLowerCase().includes(q));
  return `
  <h1>상품 관리</h1>
  <p class="sub">공통 데이터 1건으로 아마존·기타 마켓 파일을 모두 생성합니다.</p>
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
      <input placeholder="SKU·상품명·브랜드 검색" value="${esc(PROD_SEARCH)}" oninput="PROD_SEARCH=this.value;clearTimeout(window._ps);window._ps=setTimeout(render,250)" style="max-width:280px">
      <div><button class="btn-ghost" onclick="rewriteAll()">미작성 AI 리라이트</button>
      <button class="btn-ghost" onclick="downloadFile('amazon')">아마존 TSV</button>
      <button class="btn-primary" onclick="editProduct(null)">+ 추가</button></div>
    </div>
    <div id="bulkBar" style="margin-bottom:8px"></div>
    ${p.length ? `<table>
      <tr><th><input type="checkbox" onclick="selectAll(this.checked)" style="width:auto"></th><th></th><th>SKU</th><th>상품명</th><th>원가</th><th>USD</th><th>재고</th><th>상태</th><th></th></tr>
      ${p.map(x => `<tr>
        <td><input type="checkbox" class="psel" data-id="${x.id}" ${SELECTED.has(x.id) ? 'checked' : ''} onclick="toggleSel('${x.id}',this.checked)" style="width:auto"></td>
        <td><img class="thumb" src="${esc(x.images[0] || '')}" onerror="this.style.visibility='hidden'"></td>
        <td><code>${esc(x.sku)}</code></td>
        <td>${esc(x.title_en || x.title)}</td>
        <td>${x.cost ? '₩' + Number(x.cost).toLocaleString() : '-'}</td>
        <td>$${Number(x.price_usd || 0).toFixed(2)}</td>
        <td>${x.stock}</td>
        <td>${x._valid ? '<span class="pill ok">준비완료</span>' : '<span class="pill no">보완필요</span>'}${x.rewritten ? ' <span class="pill ok">AI</span>' : ''}</td>
        <td><button class="btn-ghost" onclick="editProduct('${x.id}')">편집</button> <button class="btn-danger" onclick="delProduct('${x.id}')">삭제</button></td>
      </tr>`).join('')}
    </table>` : '<p class="muted">상품이 없습니다. "+ 추가"에서 시작하세요.</p>'}
  </div>`;
}
function renderBulkBar() {
  const bar = $('#bulkBar'); if (!bar) return;
  if (!SELECTED.size) { bar.innerHTML = ''; return; }
  bar.innerHTML = `<div style="background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
    <b>${SELECTED.size}개 선택</b>
    <button class="btn-primary" onclick="rewriteSel()">AI 리라이트</button>
    <button class="btn-ghost" onclick="processImagesSel()">이미지 규격화</button>
    <button class="btn-blue" onclick="bulkUploadSel()">선택 아마존 업로드</button>
    <button class="btn-danger" onclick="bulkDeleteSel()">선택 삭제</button>
    <button class="btn-ghost" onclick="SELECTED.clear();render()">선택 해제</button>
  </div>`;
}
function toggleSel(id, on) { if (on) SELECTED.add(id); else SELECTED.delete(id); renderBulkBar(); }
function selectAll(on) {
  document.querySelectorAll('.psel').forEach(c => { c.checked = on; toggleSel(c.dataset.id, on); });
}
async function bulkDeleteSel() {
  if (!confirm(`${SELECTED.size}개 상품을 삭제할까요?`)) return;
  try { await api('/api/products/bulk-delete', { method: 'POST', body: { ids: [...SELECTED] } }); SELECTED.clear(); toast('삭제 완료', 'ok'); render(); }
  catch (e) { onErr(e); }
}
async function bulkUploadSel() {
  try { const d = await api('/api/amazon/upload', { method: 'POST', body: { ids: [...SELECTED] } });
    const okc = d.results.filter(r => r.ok).length; toast(`업로드 ${okc}/${d.results.length}`, 'ok'); }
  catch (e) { onErr(e); }
}
let EDIT_ID = null;
function editProduct(id) { EDIT_ID = id; go('add'); }
async function rewriteSel() {
  if (!SELECTED.size) return;
  toast('AI 리라이트 중...', '');
  try { const d = await api('/api/products/rewrite', { method: 'POST', body: { ids: [...SELECTED] } });
    SELECTED.clear(); toast(`${d.done}개 리라이트 완료${d.limited ? ' (AI 한도 도달)' : ''}`, 'ok'); render(); }
  catch (e) { onErr(e); }
}
async function processImagesSel() {
  if (!SELECTED.size) return;
  toast('이미지 규격화 중...', '');
  try { const d = await api('/api/products/process-images', { method: 'POST', body: { ids: [...SELECTED] } });
    SELECTED.clear();
    toast(d.available ? `${d.done}개 상품 이미지 규격화` : 'sharp 미설치 — 배포 시 npm i sharp 하면 동작', d.available ? 'ok' : ''); render(); }
  catch (e) { onErr(e); }
}
async function rewriteAll() {
  if (!confirm('아직 리라이트 안 된 상품을 AI로 재작성할까요? (AI 월 한도 소모)')) return;
  toast('AI 리라이트 중... (개수에 따라 시간이 걸립니다)', '');
  try { const d = await api('/api/products/rewrite', { method: 'POST', body: {} });
    toast(`${d.done}개 리라이트 완료${d.limited ? ' (AI 한도 도달)' : ''}`, 'ok'); render(); }
  catch (e) { onErr(e); }
}

function viewAdd() {
  return `
  <h1>상품 추가</h1>
  <p class="sub">원하는 방식으로 상품 정보를 넣으세요. 어느 쪽이든 공통 카탈로그로 모입니다.</p>
  <div class="tabbar">
    <button data-m="manual" class="active">직접 입력</button>
    <button data-m="file">엑셀/CSV 업로드</button>
    <button data-m="url">쇼핑몰에서 가져오기</button>
    <button data-m="ai">AI 자동 생성</button>
  </div>
  <div id="addBody"></div>`;
}

function bindAdd() {
  const bar = $('#main .tabbar');
  bar.querySelectorAll('button').forEach(b => b.onclick = () => {
    bar.querySelectorAll('button').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); renderAddBody(b.dataset.m);
  });
  renderAddBody('manual');
}
function renderAddBody(m) {
  const b = $('#addBody');
  if (m === 'manual') b.innerHTML = addManual();
  else if (m === 'file') b.innerHTML = addFile();
  else if (m === 'url') b.innerHTML = addUrl();
  else if (m === 'ai') b.innerHTML = addAi();
}

function field(id, label, val, ph, type) { return `<div><label>${label}</label><input id="${id}" type="${type || 'text'}" value="${esc(val == null ? '' : val)}" placeholder="${esc(ph || '')}"></div>`; }
const MARKET_OPTS = ['amazon', 'ebay', 'coupang', 'naver', 'openmarket', 'ownmall'];
function addManual() {
  const e = (typeof EDIT_ID !== 'undefined' && EDIT_ID) ? (STATE.products.find(p => p.id === EDIT_ID) || {}) : {};
  const mk = e.markets || ['amazon'];
  return `<div class="card"><h3>${e.id ? '상품 편집' : '직접 입력'}</h3>
    <div class="row">${field('f_sku', 'SKU (필수)', e.sku, 'IG-XXXX-001')}${field('f_brand', '브랜드', e.brand, 'STUDIO ig')}</div>
    <div class="row">${field('f_title', '상품명(국문)', e.title, '보온 텀블러 500ml')}${field('f_title_en', '영문 제목(아마존, 200자↓)', e.title_en, 'Insulated Tumbler 500ml')}</div>
    <div class="row">${field('f_cost', '사입원가(₩)', e.cost, '8000', 'number')}${field('f_shipcost', '입고배송비(₩)', e.shipCost, '2500', 'number')}${field('f_price', '국내가(원)', e.price, '19900', 'number')}${field('f_price_usd', 'USD 가격', e.price_usd, '16.99', 'number')}${field('f_stock', '재고', e.stock, '100', 'number')}</div>
    <label>판매 마켓</label>
    <div class="row" style="gap:14px">${MARKET_OPTS.map(m => `<label style="display:flex;align-items:center;gap:5px;flex:0 0 auto"><input type="checkbox" class="fmk" value="${m}" ${mk.includes(m) ? 'checked' : ''} style="width:auto"> ${MARKET_LABEL[m] || m}</label>`).join('')}</div>
    <label>이미지 URL (쉼표로 여러 장)</label><textarea id="f_images" placeholder="https://.../1.jpg, https://.../2.jpg">${esc((e.images || []).join(', '))}</textarea>
    <label>영문 불렛 (줄바꿈으로 구분, 최대 5)</label><textarea id="f_bullets" placeholder="LONG BATTERY: ...">${esc((e.bullets_en || []).join('\n'))}</textarea>
    <div class="row">${field('f_keywords', '검색 키워드', e.keywords, 'tumbler, travel mug')}${field('f_origin', '원산지', e.origin, 'South Korea')}</div>
    <label>상품 설명(영문)</label><textarea id="f_desc_en">${esc(e.description_en || '')}</textarea>
    <div style="margin-top:14px"><button class="btn-primary" onclick="saveManual()">${e.id ? '변경 저장' : '상품 저장'}</button>${e.id ? ' <button class="btn-ghost" onclick="EDIT_ID=null;go(\'products\')">취소</button>' : ''}</div>
  </div>`;
}
async function saveManual() {
  const markets = Array.from(document.querySelectorAll('.fmk:checked')).map(c => c.value);
  const body = {
    sku: $('#f_sku').value.trim(), brand: $('#f_brand').value, title: $('#f_title').value, title_en: $('#f_title_en').value,
    cost: $('#f_cost').value, shipCost: $('#f_shipcost').value, price: $('#f_price').value, price_usd: $('#f_price_usd').value, stock: $('#f_stock').value,
    images: $('#f_images').value.split(',').map(s => s.trim()).filter(Boolean),
    bullets_en: $('#f_bullets').value.split('\n').map(s => s.trim()).filter(Boolean),
    keywords: $('#f_keywords').value, origin: $('#f_origin').value, description_en: $('#f_desc_en').value,
    markets: markets.length ? markets : ['amazon'],
  };
  if (!body.sku) return toast('SKU는 필수입니다', 'err');
  // 편집 중이면 기존 전체 필드 병합(덮어쓰기 방지)
  if (typeof EDIT_ID !== 'undefined' && EDIT_ID) { const e = STATE.products.find(p => p.id === EDIT_ID); if (e) { const merged = { ...e, ...body }; delete merged._valid; Object.assign(body, merged); } }
  try { await api('/api/products', { method: 'POST', body }); EDIT_ID = null; toast('저장되었습니다', 'ok'); go('products'); }
  catch (e) { onErr(e); }
}

function addFile() {
  return `<div class="card"><h3>엑셀/CSV 업로드</h3>
    <p class="muted">열 이름 예: sku, title, title_en, brand, price, price_usd, stock, images, bullets_en, keywords, origin. (국문 열 이름도 인식: 상품명·판매가·재고·대표이미지 등)</p>
    <input id="f_file" type="file" accept=".xlsx,.xls,.csv">
    <div style="margin-top:14px"><button class="btn-primary" onclick="uploadFile()">업로드 후 가져오기</button>
    <button class="btn-ghost" onclick="downloadTemplate()">빈 템플릿 받기</button></div>
  </div>`;
}
async function uploadFile() {
  const f = $('#f_file').files[0];
  if (!f) return toast('파일을 선택하세요', 'err');
  const fd = new FormData(); fd.append('file', f);
  try { const d = await api('/api/products/import-file', { method: 'POST', body: fd }); toast(`${d.count}개 상품을 가져왔습니다`, 'ok'); go('products'); }
  catch (e) { onErr(e); }
}
function downloadTemplate() {
  const headers = ['sku', 'title', 'title_en', 'brand', 'price', 'price_usd', 'stock', 'images', 'bullets_en', 'keywords', 'origin'];
  const csv = '﻿' + headers.join(',') + '\n';
  const a = el('a', { href: 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv), download: 'autolist_template.csv' });
  document.body.appendChild(a); a.click(); a.remove();
}

function addUrl() {
  return `<div class="card"><h3>쇼핑몰 단건 가져오기</h3>
    <p class="muted">상품 페이지 URL 하나를 넣으면 제목·이미지·가격·설명을 추출해 상품으로 만듭니다.</p>
    <label>상품 페이지 URL</label><input id="f_url" type="url" placeholder="https://smartstore.naver.com/.../products/...">
    <div style="margin-top:14px"><button class="btn-primary" onclick="importUrl()">가져오기</button></div>
    <div id="importPreview" style="margin-top:16px"></div>
  </div>
  <div class="card"><h3>쇼핑몰 전체 가져오기 (대량)</h3>
    <p class="muted">카테고리·목록 페이지 URL(또는 sitemap.xml)을 넣으면 그 안의 상품을 전부 모아 한 번에 가져옵니다. 소매몰(다이소몰·아트박스·뮤지엄숍·쿠팡·스마트스토어·Temu·1688·알리바바)과 도매·사입몰(도매꾹·도매매·오너클랜·온채널·도매토피아)을 지원합니다.</p>
    <div class="row">
      <div style="flex:3"><label>목록/카테고리 URL</label><input id="f_mall" type="url" placeholder="https://.../category/... 또는 .../sitemap.xml"></div>
      <div><label>최대 개수</label><input id="f_malln" type="number" value="30"></div>
    </div>
    <label style="display:flex;align-items:center;gap:6px;margin-top:8px"><input type="checkbox" id="f_render" style="width:auto"> JS 렌더링 모드(자바스크립트로 그려지는 몰, 느림)</label>
    <div style="margin-top:14px"><button class="btn-primary" onclick="importMall()">전체 가져오기</button></div>
    <p class="muted" style="margin-top:8px">참고: 상품 이미지·브랜드·상세는 원 판매자/제조사 권리일 수 있어, 아마존 재판매 시 자체 이미지·설명으로 교체를 권장합니다. 사이트 구조에 따라 수집량이 달라질 수 있습니다.</p>
    <div id="mallResult" style="margin-top:12px"></div>
  </div>
  <div class="card" style="border:2px solid var(--accent)">
    <h3>원클릭 자동 파이프라인</h3>
    <p class="muted">위 "목록/카테고리 URL"을 넣고 누르면: 대량 가져오기 → AI 리라이트 → 가격 규칙 적용 → (옵션) 이미지 규격화 → 아마존 업로드까지 한 번에.</p>
    <div class="row" style="gap:14px;margin:6px 0">
      <label style="display:flex;align-items:center;gap:5px;flex:0 0 auto"><input type="checkbox" id="pl_rewrite" checked style="width:auto"> AI 리라이트</label>
      <label style="display:flex;align-items:center;gap:5px;flex:0 0 auto"><input type="checkbox" id="pl_price" checked style="width:auto"> 가격 적용</label>
      <label style="display:flex;align-items:center;gap:5px;flex:0 0 auto"><input type="checkbox" id="pl_images" style="width:auto"> 이미지 규격화</label>
      <label style="display:flex;align-items:center;gap:5px;flex:0 0 auto"><input type="checkbox" id="pl_upload" checked style="width:auto"> 아마존 업로드</label>
    </div>
    <div class="row" style="gap:14px;margin:6px 0;align-items:center">
      <div><label>가격 전략</label><select id="pl_strategy" onchange="document.getElementById('pl_undercut_wrap').style.display=this.value==='competitive'?'':'none'">
        <option value="costplus">사입원가 + 마진</option>
        <option value="competitive">경쟁 최저가 언더컷(사입가 무관)</option></select></div>
      <div id="pl_undercut_wrap" style="display:none"><label>언더컷 %</label><input id="pl_undercut" type="number" value="${STATE.config.undercutPct}" style="width:80px"></div>
      <label style="display:flex;align-items:center;gap:5px;flex:0 0 auto;margin-top:18px"><input type="checkbox" id="pl_stage" ${STATE.config.stageReview ? 'checked' : ''} style="width:auto"> 비교 확인(대기)만 — 업로드 보류</label>
    </div>
    <button class="btn-primary" onclick="runPipeline()">원클릭 실행</button>
    <div id="pipeResult" style="margin-top:12px"></div>
  </div>`;
}
async function runPipeline() {
  const listUrl = $('#f_mall').value.trim();
  if (!listUrl) return toast('위 목록/카테고리 URL을 먼저 입력하세요', 'err');
  const body = { listUrl, limit: Number($('#f_malln').value) || 20, render: $('#f_render').checked,
    rewrite: $('#pl_rewrite').checked, price: $('#pl_price').checked, images: $('#pl_images').checked, upload: $('#pl_upload').checked,
    priceStrategy: $('#pl_strategy').value, undercutPct: Number($('#pl_undercut').value) || undefined, stage: $('#pl_stage').checked };
  const box = $('#pipeResult'); if (box) box.innerHTML = '<p class="muted">파이프라인 실행 중... (가져오기·리라이트·가격·업로드 순차 진행, 수십 초~수 분)</p>';
  try {
    const d = await api('/api/pipeline/run', { method: 'POST', body });
    const s = d.steps || {};
    const line = (k, v) => v ? `<div>${k}: ${v}</div>` : '';
    box.innerHTML = `<div class="card" style="background:var(--panel2)">
      ${line('① 가져오기', s.import ? `발견 ${s.import.found} · 등록 <b>${s.import.added}</b>` : '-')}
      ${line('② AI 리라이트', s.rewrite ? (s.rewrite.error ? '오류' : `${s.rewrite.done}개`) : '건너뜀')}
      ${line('③ 가격 적용', s.price ? (s.price.error ? '오류' : (s.price.mode === 'competitive' ? `경쟁 최저가 -${s.price.undercutPct}% 적용 ${s.price.priced}개` : `${s.price.applied}개`)) : '건너뜀')}
      ${line('③-2 마진 게이트', s.margin ? (s.margin.error ? '오류' : `기준 ${s.margin.minMarginPct}%${s.margin.mode === 'ship-separate' ? '(배송비 별도)' : ''} · 보류 <b>${s.margin.held}</b>개${s.margin.noComp ? ` · 경쟁없음 ${s.margin.noComp}개` : ''}`) : '')}
      ${line('④ 이미지 규격화', s.images ? (s.images.error ? '오류' : `${s.images.done}개${s.images.available ? '' : ' (sharp 미설치)'}`) : '건너뜀')}
      ${line('⑤ 업로드', s.upload ? (s.upload.note ? s.upload.note : (s.upload.skipped ? s.upload.skipped : Object.entries(s.upload).map(([mk, v]) => `${MARKET_LABEL[mk] || mk} ${v.error ? '오류' : (v.ok + '/' + v.total)}`).join(', '))) : '건너뜀')}
      ${d.staged ? '<div style="margin-top:8px"><button class="btn-primary" onclick="go(\'pending\')">대기·검토 열기</button></div>' : ''}
      ${d.note ? `<p class="muted">${esc(d.note)}</p>` : '<div style="margin-top:8px"><button class="btn-blue" onclick="go(\'products\')">상품 보기</button></div>'}
    </div>`;
    toast('파이프라인 완료', 'ok');
  } catch (e) { onErr(e); if (box) box.innerHTML = ''; }
}
async function importMall() {
  const listUrl = $('#f_mall').value.trim();
  if (!listUrl) return toast('목록/카테고리 URL을 입력하세요', 'err');
  const box = $('#mallResult'); if (box) box.innerHTML = '<p class="muted">상품을 수집·가져오는 중... (개수에 따라 수십 초 걸릴 수 있어요)</p>';
  try {
    const d = await api('/api/products/import-mall', { method: 'POST', body: { listUrl, limit: Number($('#f_malln').value) || 30, render: $('#f_render').checked } });
    if (box) box.innerHTML = `<div class="card" style="background:var(--panel2)">
      <p>발견 ${d.found}개 · 가져옴 ${d.imported}개 · 등록 <b class="result-ok">${d.added}개</b>${d.failed ? ` · 실패 ${d.failed}` : ''}${d.limited ? ' · <span class="pill warn">요금제 한도 도달</span>' : ''}</p>
      ${d.added ? `<button class="btn-blue" onclick="go('products')">상품 목록 보기</button> <button class="btn-primary" onclick="rewriteAll()">가져온 상품 AI 리라이트</button>` : '<p class="muted">가져온 상품이 없습니다. 목록 URL이 상품 링크를 포함하는지 확인하거나 JS 렌더링 모드를 켜보세요.</p>'}
    </div>`;
    if (d.added) toast(`${d.added}개 상품을 가져왔습니다`, 'ok');
  } catch (e) { onErr(e); if (box) box.innerHTML = ''; }
}
async function importUrl() {
  const url = $('#f_url').value.trim();
  if (!url) return toast('URL을 입력하세요', 'err');
  toast('가져오는 중...', '');
  try {
    const d = await api('/api/products/import-url', { method: 'POST', body: { url } });
    if (!d.ok) return toast(d.error, 'err');
    const p = d.product; window._imported = p;
    $('#importPreview').innerHTML = `<div class="card" style="background:var(--panel2)">
      <div class="row"><img class="thumb" style="width:80px;height:80px" src="${esc(p.images[0] || '')}" onerror="this.style.visibility='hidden'">
      <div style="flex:3"><b>${esc(p.title)}</b><br><span class="muted">${esc((p.description || '').slice(0, 120))}</span><br>가격(추정): ${p.price || '-'}</div></div>
      <p class="muted" style="margin-top:10px">아마존용으로 영문 제목·불렛이 필요합니다. 저장 후 "AI 자동 생성"으로 보완하거나 직접 편집하세요.</p>
      <button class="btn-primary" onclick="saveImported()">이 상품 저장</button>
      <button class="btn-blue" onclick="saveImportedAndAi()">저장 + AI로 영문 생성</button>
    </div>`;
  } catch (e) { onErr(e); }
}
async function saveImported() {
  try { await api('/api/products', { method: 'POST', body: window._imported }); toast('저장되었습니다', 'ok'); go('products'); }
  catch (e) { onErr(e); }
}
async function saveImportedAndAi() {
  try {
    const p = window._imported;
    const g = await api('/api/ai/generate', { method: 'POST', body: { title: p.title, brand: p.brand, keywords: p.keywords, features: p.description } });
    Object.assign(p, { title_en: g.title_en, bullets_en: g.bullets_en, description_en: g.description_en, keywords: g.keywords || p.keywords });
    await api('/api/products', { method: 'POST', body: p });
    toast('AI 영문 생성 + 저장 완료', 'ok'); go('products');
  } catch (e) { onErr(e); }
}

function addAi() {
  return `<div class="card"><h3>AI 자동 생성</h3>
    <p class="muted">상품명·키워드·특징만 넣으면 아마존 SEO 규격의 영문 제목·불렛 5개·설명을 생성합니다.</p>
    <div class="row">${field('a_name', '상품명', '', '보온 텀블러 500ml')}${field('a_brand', '브랜드', '', 'STUDIO ig')}</div>
    <label>키워드 (쉼표)</label><input id="a_kw" placeholder="tumbler, travel mug, insulated">
    <label>특징 (줄바꿈으로)</label><textarea id="a_feat" placeholder="12시간 보온\n누수 방지 뚜껑\nBPA-free 스테인리스"></textarea>
    <div style="margin-top:14px"><button class="btn-primary" onclick="genAi()">생성하기</button></div>
    <div id="aiOut" style="margin-top:16px"></div>
  </div>`;
}
async function genAi() {
  const body = { name: $('#a_name').value, brand: $('#a_brand').value, keywords: $('#a_kw').value, features: $('#a_feat').value };
  if (!body.name) return toast('상품명을 입력하세요', 'err');
  toast('생성 중...', '');
  try {
    const g = await api('/api/ai/generate', { method: 'POST', body });
    window._aiGen = { ...body, ...g };
    $('#aiOut').innerHTML = `<div class="card" style="background:var(--panel2)">
      <label>영문 제목 (${g.title_en.length}자)</label><input id="g_title" value="${esc(g.title_en)}">
      <label>불렛 (줄바꿈)</label><textarea id="g_bullets" style="min-height:120px">${esc(g.bullets_en.join('\n'))}</textarea>
      <label>영문 설명</label><textarea id="g_desc">${esc(g.description_en)}</textarea>
      <div class="row">${field('g_sku', 'SKU', 'AI-' + Date.now().toString(36).toUpperCase())}${field('g_price', 'USD 가격', '', '0', 'number')}${field('g_stock', '재고', '', '0', 'number')}</div>
      <label>이미지 URL (쉼표)</label><input id="g_images" placeholder="https://.../1.jpg">
      <div style="margin-top:12px"><button class="btn-primary" onclick="saveAi()">상품으로 저장</button></div>
      <p class="muted" style="margin-top:8px">생성기: ${esc(g.provider)}</p>
    </div>`;
  } catch (e) { onErr(e); }
}
async function saveAi() {
  const body = {
    sku: $('#g_sku').value.trim(), brand: window._aiGen.brand, title: window._aiGen.name,
    title_en: $('#g_title').value, bullets_en: $('#g_bullets').value.split('\n').map(s => s.trim()).filter(Boolean),
    description_en: $('#g_desc').value, price_usd: $('#g_price').value, stock: $('#g_stock').value,
    images: $('#g_images').value.split(',').map(s => s.trim()).filter(Boolean), keywords: window._aiGen.keywords, markets: ['amazon'],
  };
  if (!body.sku) return toast('SKU를 입력하세요', 'err');
  try { await api('/api/products', { method: 'POST', body }); toast('저장되었습니다', 'ok'); go('products'); }
  catch (e) { onErr(e); }
}

function viewUpload() {
  const cfg = STATE.config, p = STATE.products, ready = p.filter(x => x._valid);
  return `
  <h1>아마존 업로드</h1>
  <p class="sub">3가지 방식 중 선택해 등록합니다. 준비 완료 상품만 전송됩니다.</p>
  <div class="method-cards">
    <div class="method ${cfg.amazonProvider === 'file' ? 'sel' : ''}" onclick="pickMethod('file')" id="mt_file">
      <div class="t">① 플랫파일 생성</div><div class="d">승인 불필요. TSV 파일을 만들어 셀러센터에 업로드. 지금 바로 가능.</div></div>
    <div class="method ${cfg.amazonProvider === 'spapi' ? 'sel' : ''}" onclick="pickMethod('spapi')" id="mt_spapi">
      <div class="t">② SP-API 정식연동</div><div class="d">계정 연결 시 자동 등록. 연동 설정 필요.</div></div>
    <div class="method ${cfg.amazonProvider === 'browser' ? 'sel' : ''}" onclick="pickMethod('browser')" id="mt_browser">
      <div class="t">③ 브라우저 자동화</div><div class="d">셀러센터 화면 자동 조작. 로컬 실행 + 로그인 저장 필요.</div></div>
  </div>
  <div class="card">
    <h3>업로드 실행</h3>
    <p>준비 완료 상품: <b class="result-ok">${ready.length}</b> / 전체 ${p.length}</p>
    <p class="muted">선택 방식: <b id="curMethod">${cfg.amazonProvider}</b></p>
    <button class="btn-primary" onclick="runUpload()">선택 방식으로 업로드</button>
    <button class="btn-ghost" onclick="downloadFile('amazon')">아마존 TSV만 다운로드</button>
    <div id="uploadResult" style="margin-top:16px"></div>
  </div>
  <div class="card">
    <h3>다른 마켓 동시 파일 생성</h3>
    <p class="muted">같은 상품 데이터로 여러 마켓 대량등록 파일을 한 번에 만듭니다. 각 마켓 셀러센터에 업로드하면 됩니다.</p>
    <div class="row" style="gap:16px;margin:10px 0">
      <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" class="mk" value="amazon" checked style="width:auto"> 아마존(TSV)</label>
      <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" class="mk" value="ebay" style="width:auto"> eBay(CSV)</label>
      <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" class="mk" value="coupang" style="width:auto"> 쿠팡(CSV)</label>
      <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" class="mk" value="naver" style="width:auto"> 스마트스토어(CSV)</label>
      <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" class="mk" value="openmarket" style="width:auto"> 11번가·G마켓·옥션(CSV)</label>
      <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" class="mk" value="ownmall" style="width:auto"> 자체몰(API)</label>
    </div>
    <button class="btn-primary" onclick="downloadMarkets()">선택 마켓 파일 생성·다운로드</button>
    <div style="margin-top:12px">
      <span class="muted">실연동 업로드: </span>
      <button class="btn-ghost" onclick="apiUpload('ebay')">eBay ${STATE.config.ebayLive ? 'API' : '(데모)'}</button>
      <button class="btn-ghost" onclick="apiUpload('coupang')">쿠팡 ${STATE.config.coupangLive ? 'API' : '(데모)'}</button>
    </div>
    <div id="mktUpResult" style="margin-top:10px"></div>
  </div>
  <div class="card">
    <h3>보완 필요 상품</h3>
    ${p.filter(x => !x._valid).length ? `<table><tr><th>SKU</th><th>상품명</th></tr>${p.filter(x => !x._valid).map(x => `<tr><td><code>${esc(x.sku)}</code></td><td>${esc(x.title_en || x.title)}</td></tr>`).join('')}</table>
    <p class="muted" style="margin-top:8px">영문제목·USD가격·이미지·불렛이 있어야 아마존 전송됩니다.</p>` : '<p class="muted">모두 준비 완료.</p>'}
  </div>`;
}
let CUR_METHOD = null;
function pickMethod(m) {
  CUR_METHOD = m;
  ['file', 'spapi', 'browser'].forEach(x => $('#mt_' + x).classList.toggle('sel', x === m));
  $('#curMethod').textContent = m;
}
async function runUpload() {
  const method = CUR_METHOD || STATE.config.amazonProvider;
  toast('업로드 중...', '');
  try {
    const d = await api('/api/amazon/upload', { method: 'POST', body: { method } });
    const ok = d.results.filter(r => r.ok).length;
    let html = `<p>방식 <b>${esc(d.method)}</b> · 성공 <b class="result-ok">${ok}</b> / ${d.results.length}</p>`;
    if (d.file) html += `<p>생성 파일: <b>${esc(d.file)}</b> <button class="btn-ghost" onclick="downloadFile('amazon')">다운로드</button></p>`;
    html += `<table><tr><th>SKU</th><th>결과</th><th>메모</th></tr>${d.results.map(r => `<tr><td><code>${esc(r.sku)}</code></td><td>${r.ok ? '<span class="pill ok">성공</span>' : '<span class="pill no">실패</span>'}</td><td class="muted">${esc(r.status || r.error || r.note || '')}</td></tr>`).join('')}</table>`;
    $('#uploadResult').innerHTML = html;
    toast(`업로드 완료: ${ok}건 성공`, 'ok');
    STATE = d.state;
  } catch (e) { onErr(e); }
}
async function apiUpload(market) {
  toast(market + ' 업로드 중...', '');
  try {
    const d = await api('/api/market/upload', { method: 'POST', body: { market, method: 'api' } });
    const ok = d.results.filter(r => r.ok).length;
    const box = $('#mktUpResult');
    if (box) box.innerHTML = `<p>${MARKET_LABEL[market] || market} · 방식 <b>${esc(d.method)}</b> · 성공 <b class="result-ok">${ok}</b>/${d.results.length}</p>
      <table><tr><th>SKU</th><th>결과</th><th>메모</th></tr>${d.results.map(r => `<tr><td><code>${esc(r.sku)}</code></td><td>${r.ok ? '<span class="pill ok">성공</span>' : '<span class="pill no">실패</span>'}</td><td class="muted">${esc(r.status || r.error || '')}</td></tr>`).join('')}</table>`;
    toast(`${MARKET_LABEL[market] || market} 업로드: ${ok}건 성공`, 'ok');
  } catch (e) { onErr(e); }
}
function downloadMarkets() {
  const picked = Array.from(document.querySelectorAll('.mk:checked')).map(c => c.value);
  if (!picked.length) return toast('마켓을 하나 이상 선택하세요', 'err');
  picked.forEach((m, i) => setTimeout(() => downloadFile(m), i * 600)); // 순차 다운로드(브라우저 차단 방지)
  toast(`${picked.length}개 마켓 파일 생성`, 'ok');
}
function downloadFile(market) {
  const a = el('a', { href: '/api/download/' + market + '?t=' + Date.now() });
  // 인증 헤더 필요하므로 fetch로 blob 처리
  fetch('/api/download/' + market, { headers: { Authorization: 'Bearer ' + TOKENS.access } })
    .then(r => r.ok ? r.blob().then(b => ({ b, name: (r.headers.get('content-disposition') || '').match(/filename\*=UTF-8''([^;]+)/) })) : Promise.reject(new Error('다운로드 실패')))
    .then(({ b, name }) => {
      const url = URL.createObjectURL(b);
      const link = el('a', { href: url, download: name ? decodeURIComponent(name[1]) : market + '.txt' });
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    }).catch(e => onErr(e));
}

let REV_FILTER = 'all', REV_MARKET = 'all';
function stars(n) { return '★'.repeat(n) + '☆'.repeat(5 - n); }
function viewReviews() {
  return `
  <h1>리뷰 관리</h1>
  <p class="sub">마켓 리뷰를 수집해 부정리뷰를 바로 찾아내고, AI가 답변 초안을 만들어 줍니다.</p>
  <div class="tabbar">
    <button class="${REV_FILTER === 'all' ? 'active' : ''}" onclick="setRevFilter('all')">전체</button>
    <button class="${REV_FILTER === 'negative' ? 'active' : ''}" onclick="setRevFilter('negative')">부정리뷰</button>
    <button class="${REV_FILTER === 'unanswered' ? 'active' : ''}" onclick="setRevFilter('unanswered')">미답변</button>
    <button class="btn-primary" onclick="syncReviews()">리뷰 수집</button>
    <button class="btn-ghost" onclick="csvDownload('/api/export/reviews.csv', 'reviews.csv')">CSV 내보내기</button>
  </div>
  <div id="revBody"><p class="muted">불러오는 중...</p></div>`;
}
function setRevFilter(f) { REV_FILTER = f; loadReviews(); }
async function syncReviews() {
  toast('리뷰 수집 중...', '');
  try { const d = await api('/api/reviews/sync', { method: 'POST', body: { days: 90 } });
    toast(`리뷰 ${d.fetched}건 확인 · 부정 ${d.negatives}건`, 'ok'); loadReviews(); }
  catch (e) { onErr(e); }
}
async function loadReviews() {
  try { const d = await api('/api/reviews?filter=' + REV_FILTER + '&market=' + REV_MARKET); renderReviews(d); }
  catch (e) { onErr(e); }
}
function renderReviews(d) {
  const body = $('#revBody'); if (!body) return;
  const s = d.summary;
  const head = `<div class="grid3">
    <div class="stat"><div class="n">${s.avg || 0}★</div><div class="l">평균 별점 (${s.total}건)</div></div>
    <div class="stat"><div class="n result-no">${s.negative}</div><div class="l">부정리뷰</div></div>
    <div class="stat"><div class="n" style="color:var(--warn)">${s.unanswered}</div><div class="l">미답변</div></div>
  </div>`;
  if (!d.rows.length) { body.innerHTML = head + `<div class="card"><p class="muted">리뷰가 없습니다. "리뷰 수집"을 눌러 마켓 리뷰를 가져오세요.</p></div>`; return; }
  body.innerHTML = head + d.rows.map(r => `
    <div class="card" style="border-left:4px solid ${r.sentiment === 'negative' ? 'var(--err)' : r.sentiment === 'neutral' ? 'var(--warn)' : 'var(--ok)'}">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px">
        <div><b style="color:var(--accent)">${stars(r.rating)}</b> <span class="muted">${esc(r.author)} · ${esc(MARKET_LABEL[r.market] || r.market)} · ${esc(r.productTitle || r.sku)} · ${new Date(r.at).toLocaleDateString('ko-KR')}</span></div>
        <div>${r.answered ? '<span class="pill ok">답변완료</span>' : '<span class="pill warn">미답변</span>'}</div>
      </div>
      <p style="margin:8px 0">${esc(r.text)}</p>
      ${r.answered ? `<div style="background:var(--panel2);border-radius:8px;padding:10px"><span class="muted">내 답변:</span><br>${esc(r.reply)}</div>`
        : `<div><button class="btn-blue" onclick="draftReply('${esc(r.reviewId)}')">AI 답변 초안</button></div>
           <div id="reply_${esc(r.reviewId)}" style="margin-top:8px"></div>`}
    </div>`).join('');
}
async function draftReply(reviewId) {
  const box = $('#reply_' + reviewId); if (box) box.innerHTML = '<p class="muted">초안 생성 중...</p>';
  try {
    const d = await api('/api/reviews/draft', { method: 'POST', body: { reviewId } });
    box.innerHTML = `<textarea id="rtext_${reviewId}" style="min-height:90px">${esc(d.draft)}</textarea>
      <div style="margin-top:6px"><button class="btn-primary" onclick="postReply('${reviewId}')">답변 등록</button> <span class="muted">생성: ${esc(d.provider)}</span></div>`;
  } catch (e) { onErr(e); }
}
async function postReply(reviewId) {
  const text = $('#rtext_' + reviewId).value;
  try { await api('/api/reviews/reply', { method: 'POST', body: { reviewId, text } }); toast('답변 등록됨', 'ok'); loadReviews(); }
  catch (e) { onErr(e); }
}

let PROFIT_DAYS = 30, PROFIT_MARKET = 'all';
function viewProfit() {
  return `
  <h1>정산·순이익</h1>
  <p class="sub">매출에서 원가·마켓 수수료·배송비를 뺀 순이익을 집계합니다. (해외 매출은 환율로 원화 환산)</p>
  <div class="tabbar">
    <button onclick="setProfitDays(7)" class="${PROFIT_DAYS === 7 ? 'active' : ''}">7일</button>
    <button onclick="setProfitDays(30)" class="${PROFIT_DAYS === 30 ? 'active' : ''}">30일</button>
    <button onclick="setProfitDays(90)" class="${PROFIT_DAYS === 90 ? 'active' : ''}">90일</button>
    <button class="btn-ghost" onclick="csvDownload('/api/export/profit.csv?days=' + PROFIT_DAYS, 'profit.csv')">CSV 내보내기</button>
  </div>
  <div id="profitBody"><p class="muted">집계 중...</p></div>`;
}
function setProfitDays(d) { PROFIT_DAYS = d; render(); }
function setProfitMarket(m) { PROFIT_MARKET = m; loadProfit(); }
async function loadProfit() {
  try { const d = await api('/api/profit?days=' + PROFIT_DAYS + '&market=' + PROFIT_MARKET); renderProfit(d.report); }
  catch (e) { onErr(e); }
}
function won(v) { return '₩' + Math.round(v || 0).toLocaleString(); }
function renderProfit(r) {
  const body = $('#profitBody'); if (!body) return;
  const isAdmin = STATE.billing.isAdmin;
  const filter = (r.markets && r.markets.length > 1) ? `<div class="tabbar" style="margin-bottom:14px">${r.markets.map(m => `<button class="${(r.market || 'all') === m ? 'active' : ''}" onclick="setProfitMarket('${m}')">${esc(m === 'all' ? '전체' : (MARKET_LABEL[m] || m))}</button>`).join('')}</div>` : '';
  const netColor = r.net >= 0 ? 'var(--ok)' : 'var(--err)';
  body.innerHTML = filter + `
  <div class="grid3">
    <div class="stat"><div class="n" style="color:var(--accent)">${won(r.revenue)}</div><div class="l">매출 (${r.days}일)</div></div>
    <div class="stat"><div class="n" style="color:${netColor}">${won(r.net)}</div><div class="l">순이익 (마진 ${r.marginPct}%)</div></div>
    <div class="stat"><div class="n">${r.orders}</div><div class="l">주문 수</div></div>
  </div>
  <div class="card"><h3>비용 분해</h3>
    ${hbars([
      { label: '매출', value: r.revenue, sub: '' },
      { label: '원가(COGS)', value: r.cogs, sub: '' },
      { label: '마켓 수수료', value: r.fees, sub: '' },
      { label: '배송비', value: r.shipping, sub: '' },
      { label: '순이익', value: Math.max(0, r.net), sub: r.net < 0 ? '(적자)' : '' },
    ].map(x => ({ label: x.label, value: x.value, sub: won(x.value) })))}
    ${r.byProduct.every(p => p.net === p.revenue) ? '<p class="muted" style="margin-top:8px">원가(cost) 미설정 상품은 원가 0으로 계산됩니다. 상품에 원가를 넣으면 정확해집니다.</p>' : ''}
  </div>
  <div class="card"><h3>상품별 순이익 (상위)</h3>
    ${r.byProduct.length ? `<table><tr><th>상품</th><th>판매수</th><th>매출</th><th>순이익</th></tr>
      ${r.byProduct.map(p => `<tr><td>${esc(p.title)}</td><td>${p.units}</td><td>${won(p.revenue)}</td><td style="color:${p.net >= 0 ? 'var(--ok)' : 'var(--err)'}">${won(p.net)}</td></tr>`).join('')}</table>` : '<p class="muted">주문이 없습니다. 판매 현황에서 주문을 동기화하세요.</p>'}
  </div>
  <div class="card"><h3>마켓별 순이익</h3>
    ${r.byMarket.length ? `<table><tr><th>마켓</th><th>매출</th><th>순이익</th></tr>${r.byMarket.map(m => `<tr><td>${esc(MARKET_LABEL[m.market] || m.market)}</td><td>${won(m.revenue)}</td><td style="color:${m.net >= 0 ? 'var(--ok)' : 'var(--err)'}">${won(m.net)}</td></tr>`).join('')}</table>` : '<p class="muted">없음</p>'}
  </div>
  <div class="card"><h3>정산 설정</h3>
    <p class="muted">환율 1 USD = ₩${(r.fxKRW).toLocaleString()} 기준. 주문당 배송비(원가성) 설정.</p>
    <label>주문당 배송비(₩)</label><input id="shipCost" type="number" value="${r.shippingCostKRW}" ${isAdmin ? '' : 'disabled'} style="max-width:200px">
    ${isAdmin ? `<div style="margin-top:10px"><button class="btn-ghost" onclick="saveShipCost()">저장</button></div>` : ''}
  </div>`;
}
async function saveShipCost() {
  try { await api('/api/settings/shipping', { method: 'POST', body: { shippingCostKRW: $('#shipCost').value } }); toast('배송비 저장', 'ok'); loadProfit(); }
  catch (e) { onErr(e); }
}

function viewPending() {
  return `
  <h1>대기·검토</h1>
  <p class="sub">업로드 전 대기 상태 상품을 경쟁 최저가·책정가·마진과 비교해보고, 승인하면 업로드됩니다. 마진 미달로 보류된 상품도 함께 봅니다.</p>
  <div id="pendingBody"><p class="muted">불러오는 중...</p></div>`;
}
async function loadPending() {
  try { const d = await api('/api/pending'); renderPending(d); }
  catch (e) { onErr(e); }
}
function pmBest(snapshot) {
  if (!snapshot || !snapshot.perMarket) return null;
  return Object.entries(snapshot.perMarket).map(([mk, v]) => ({ mk, ...v })).find(v => v.suggested != null) || null;
}
function renderPending(d) {
  const box = $('#pendingBody'); if (!box) return;
  const rowHtml = (r, pending) => {
    const b = pmBest(r.snapshot);
    const cur = b && b.currency === 'USD' ? '$' : '₩';
    const myPrice = r.price_usd ? '$' + r.price_usd : (r.price ? '₩' + Number(r.price).toLocaleString() : '-');
    const low = b && b.lowestComp != null ? cur + Number(b.lowestComp).toLocaleString() : (b && b.noComp ? '경쟁없음' : '-');
    const mg = r.snapshot && r.snapshot.worstMarginPct != null ? r.snapshot.worstMarginPct + '%' : '-';
    const mgCls = r.snapshot && r.snapshot.worstMarginPct != null && r.snapshot.worstMarginPct < (r.snapshot.minMarginPct || 10) ? 'result-no' : 'result-ok';
    return `<tr>
      <td><input type="checkbox" class="pend_ck" value="${r.id}" ${pending ? 'checked' : ''} style="width:auto"></td>
      <td>${esc(r.sku)}</td><td>${esc((r.title || '').slice(0, 26))}</td>
      <td>${(r.markets || []).map(m => MARKET_LABEL[m] || m).join('·')}</td>
      <td>${r.landed ? '₩' + r.landed.toLocaleString() : '-'}</td>
      <td>${low}</td><td><b>${myPrice}</b></td>
      <td class="${mgCls}">${mg}</td>
      <td>${pending ? '<span class="pill warn">대기</span>' : '<span class="pill no">보류</span>'}</td>
    </tr>`;
  };
  box.innerHTML = `
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <h3 style="margin:0">대기 중 (검토) — ${d.pending.length}개</h3>
      <div>
        <button class="btn-ghost" onclick="pendSelectAll(true)">전체선택</button>
        <button class="btn-danger" onclick="rejectPending()">선택 거절(삭제)</button>
        <button class="btn-primary" onclick="approvePending()">선택 승인·업로드</button>
      </div>
    </div>
    ${d.pending.length ? `<table><tr><th></th><th>SKU</th><th>상품</th><th>마켓</th><th>원가합</th><th>경쟁최저가</th><th>책정가</th><th>마진</th><th>상태</th></tr>
      ${d.pending.map(r => rowHtml(r, true)).join('')}</table>`
      : '<p class="muted">대기 중인 상품이 없습니다. 파이프라인·스케줄에서 "대기(검토)" 모드로 돌리면 여기에 모입니다.</p>'}
  </div>
  ${d.held.length ? `<div class="card">
    <h3>마진 미달 보류 — ${d.held.length}개</h3>
    <p class="muted">배송비 별도 기준 최소마진 미달로 자동 보류된 상품입니다. 원가·가격을 조정하거나 거절하세요.</p>
    <table><tr><th></th><th>SKU</th><th>상품</th><th>마켓</th><th>원가합</th><th>경쟁최저가</th><th>책정가</th><th>마진</th><th>상태</th></tr>
      ${d.held.map(r => rowHtml(r, false)).join('')}</table>
    <div style="margin-top:8px"><button class="btn-danger" onclick="rejectPending()">선택 거절(삭제)</button></div>
  </div>` : ''}`;
}
function pendSelectAll(on) { document.querySelectorAll('.pend_ck').forEach(c => c.checked = on); }
function pendIds() { return Array.from(document.querySelectorAll('.pend_ck:checked')).map(c => c.value); }
async function approvePending() {
  const ids = pendIds(); if (!ids.length) return toast('승인할 상품을 선택하세요', 'err');
  if (!confirm(`${ids.length}개 상품을 승인하고 각 마켓에 업로드할까요?`)) return;
  toast('승인·업로드 중...', '');
  try { const d = await api('/api/pending/approve', { method: 'POST', body: { ids } });
    const up = Object.entries(d.upload || {}).map(([mk, v]) => `${MARKET_LABEL[mk] || mk} ${v.error ? '오류' : v.ok + '/' + v.total}`).join(', ');
    toast(`${d.approved}개 승인 · ${up || '업로드 완료'}`, 'ok'); STATE = d.state; loadPending(); }
  catch (e) { onErr(e); }
}
async function rejectPending() {
  const ids = pendIds(); if (!ids.length) return toast('거절할 상품을 선택하세요', 'err');
  if (!confirm(`${ids.length}개 상품을 거절(삭제)할까요?`)) return;
  try { await api('/api/pending/reject', { method: 'POST', body: { ids } }); toast('거절 완료', 'ok'); loadPending(); }
  catch (e) { onErr(e); }
}

function viewAutomation() {
  const mkts = ['amazon', 'ebay', 'coupang', 'naver', 'openmarket', 'ownmall'];
  return `
  <h1>자동화</h1>
  <p class="sub">쇼핑몰 목록 URL과 주기를 등록하면 서버가 알아서 가져오기→AI 리라이트→가격→(옵션)이미지→업로드를 반복 실행합니다.</p>
  <div class="card">
    <h3>새 자동 스케줄</h3>
    <div class="row">
      <div style="flex:3"><label>목록/카테고리 URL</label><input id="sc_url" placeholder="예: 아트박스 신상품, 다이소 카테고리 주소"></div>
      <div><label>최대 개수</label><input id="sc_limit" type="number" value="20"></div>
    </div>
    <label>업로드 마켓(복수 선택)</label>
    <div class="row" style="gap:14px;margin:4px 0 8px">${mkts.map(m => `<label style="display:flex;align-items:center;gap:5px;flex:0 0 auto"><input type="checkbox" class="sc_mk" value="${m}" ${(m === 'amazon' || m === 'ebay') ? 'checked' : ''} style="width:auto"> ${MARKET_LABEL[m] || m}</label>`).join('')}</div>
    <div class="row">
      <div><label>주기</label><select id="sc_cadence"><option value="daily">매일</option><option value="weekly">매주</option><option value="hourly">매시간</option></select></div>
    </div>
    <div class="row" style="gap:14px;margin:8px 0">
      <label style="display:flex;align-items:center;gap:5px;flex:0 0 auto"><input type="checkbox" id="sc_rewrite" checked style="width:auto"> AI 리라이트</label>
      <label style="display:flex;align-items:center;gap:5px;flex:0 0 auto"><input type="checkbox" id="sc_price" checked style="width:auto"> 가격 적용</label>
      <label style="display:flex;align-items:center;gap:5px;flex:0 0 auto"><input type="checkbox" id="sc_images" style="width:auto"> 이미지 규격화</label>
      <label style="display:flex;align-items:center;gap:5px;flex:0 0 auto"><input type="checkbox" id="sc_upload" checked style="width:auto"> 업로드</label>
      <label style="display:flex;align-items:center;gap:5px;flex:0 0 auto"><input type="checkbox" id="sc_syncstock" checked style="width:auto"> 소스 품절 동기화</label>
    </div>
    <div class="row" style="gap:14px;margin:4px 0 8px;align-items:center">
      <div><label>가격 전략</label><select id="sc_strategy" onchange="document.getElementById('sc_undercut_wrap').style.display=this.value==='competitive'?'':'none'">
        <option value="costplus">사입원가 + 마진</option>
        <option value="competitive">경쟁 최저가 언더컷(사입가 무관)</option></select></div>
      <div id="sc_undercut_wrap" style="display:none"><label>언더컷 %</label><input id="sc_undercut" type="number" value="${STATE.config.undercutPct}" style="width:80px"></div>
      <label style="display:flex;align-items:center;gap:5px;flex:0 0 auto;margin-top:18px"><input type="checkbox" id="sc_stage" ${STATE.config.stageReview ? 'checked' : ''} style="width:auto"> 비교 확인(대기)만 — 업로드 보류</label>
    </div>
    <p class="muted">경쟁 최저가 언더컷: 같은·비슷한 상품의 최저가보다 설정%만큼 싸게 책정하고, 배송비 별도·순마진 ${STATE.config.undercutMinMarginPct}% 이상 나는 상품만 업로드합니다. 경쟁 제품이 없으면 원가의 2배로 책정(기준은 연동 설정에서 변경).</p>
    <button class="btn-primary" onclick="addSchedule()">스케줄 등록</button>
  </div>
  <div id="schedBody"></div>`;
}
async function loadSchedules() {
  try { const d = await api('/api/pipeline/schedules'); renderSchedules(d.schedules); }
  catch (e) { onErr(e); }
}
const CADENCE_LABEL = { daily: '매일', weekly: '매주', hourly: '매시간' };
function renderSchedules(list) {
  const box = $('#schedBody'); if (!box) return;
  if (!list.length) { box.innerHTML = '<div class="card"><p class="muted">등록된 자동 스케줄이 없습니다.</p></div>'; return; }
  box.innerHTML = `<div class="card"><h3>등록된 스케줄 (${list.length})</h3>
    <table><tr><th>상태</th><th>주기</th><th>마켓</th><th>목록 URL</th><th>단계</th><th>최근 실행</th><th></th></tr>
    ${list.map(s => `<tr>
      <td>${s.enabled ? '<span class="pill ok">ON</span>' : '<span class="pill no">OFF</span>'}</td>
      <td>${CADENCE_LABEL[s.cadence] || s.cadence}</td>
      <td>${(s.markets || [s.market]).map(m => MARKET_LABEL[m] || m).join('·')}</td>
      <td class="muted" style="white-space:normal;max-width:240px">${esc(s.listUrl)}</td>
      <td class="muted">${[s.options.rewrite && '리라이트', s.options.price && '가격', s.options.images && '이미지', s.options.upload && '업로드'].filter(Boolean).join('·')}</td>
      <td class="muted">${s.lastResult ? (s.lastResult.error ? '오류' : (s.lastResult.added + '개 · ' + new Date(s.lastResult.at).toLocaleDateString('ko-KR'))) : '-'}</td>
      <td>
        <button class="btn-blue" onclick="runScheduleNow('${s.id}')">지금 실행</button>
        <button class="btn-ghost" onclick="toggleSchedule('${s.id}', ${s.enabled ? 'false' : 'true'})">${s.enabled ? '중지' : '시작'}</button>
        <button class="btn-danger" onclick="deleteSchedule('${s.id}')">삭제</button>
      </td>
    </tr>`).join('')}</table>
  </div>`;
}
async function addSchedule() {
  const listUrl = $('#sc_url').value.trim(); if (!listUrl) return toast('목록 URL을 입력하세요', 'err');
  const markets = Array.from(document.querySelectorAll('.sc_mk:checked')).map(c => c.value);
  if (!markets.length) return toast('업로드 마켓을 하나 이상 선택하세요', 'err');
  const body = { listUrl, limit: Number($('#sc_limit').value) || 20, market: markets[0], cadence: $('#sc_cadence').value,
    options: { markets, rewrite: $('#sc_rewrite').checked, price: $('#sc_price').checked, images: $('#sc_images').checked, upload: $('#sc_upload').checked, syncStock: $('#sc_syncstock').checked,
      priceStrategy: $('#sc_strategy').value, undercutPct: Number($('#sc_undercut').value) || undefined, stage: $('#sc_stage').checked } };
  try { await api('/api/pipeline/schedules', { method: 'POST', body }); toast('스케줄 등록됨', 'ok'); $('#sc_url').value=''; loadSchedules(); }
  catch (e) { onErr(e); }
}
async function toggleSchedule(id, enabled) { try { await api('/api/pipeline/schedules/toggle', { method: 'POST', body: { id, enabled } }); loadSchedules(); } catch (e) { onErr(e); } }
async function deleteSchedule(id) { if (!confirm('이 스케줄을 삭제할까요?')) return; try { await api('/api/pipeline/schedules/' + id, { method: 'DELETE' }); toast('삭제됨', 'ok'); loadSchedules(); } catch (e) { onErr(e); } }
async function runScheduleNow(id) {
  toast('스케줄 지금 실행 중...', '');
  try { const d = await api('/api/pipeline/schedules/run-now', { method: 'POST', body: { id } });
    const r = d.lastResult; toast(r && !r.error ? `실행 완료: ${r.added || 0}개 처리` : '실행 완료', 'ok'); renderSchedules(d.schedules); }
  catch (e) { onErr(e); }
}

function viewSourcing() {
  const mkts = ['amazon', 'ebay', 'coupang', 'naver', 'openmarket', 'ownmall'];
  return `
  <h1>소싱 발굴</h1>
  <p class="sub">카테고리·키워드·예산만 넣으면 팔릴 만한 후보 상품을 찾아 수요·마진·경쟁으로 점수 매겨 추천합니다. 좋은 건 바로 상품으로 등록하세요.</p>
  <div class="card">
    <div class="row">
      <div><label>카테고리</label><select id="s_cat">
        <option value="">전체(종합)</option><option value="kitchen">주방</option><option value="electronics">전자·가전</option>
        <option value="beauty">뷰티</option><option value="home">홈·생활</option><option value="fitness">운동·피트니스</option>
        <option value="pet">반려동물</option><option value="baby">육아</option></select></div>
      <div><label>키워드(선택)</label><input id="s_kw" placeholder="예: tumbler, 캠핑"></div>
      <div><label>마켓</label><select id="s_market">${mkts.map(m => `<option value="${m}">${MARKET_LABEL[m] || m}</option>`).join('')}</select></div>
      <div><label>개당 소싱예산(₩, 선택)</label><input id="s_budget" type="number" placeholder="예: 10000"></div>
    </div>
    <div style="margin-top:14px"><button class="btn-primary" onclick="runSourcing()">후보 발굴</button></div>
  </div>
  <div id="sourcingBody"></div>`;
}
async function runSourcing() {
  const body = { category: $('#s_cat').value, keyword: $('#s_kw').value, market: $('#s_market').value, budgetKRW: Number($('#s_budget').value) || 0 };
  const box = $('#sourcingBody'); if (box) box.innerHTML = '<p class="muted">시장을 조사하는 중...</p>';
  try { const d = await api('/api/sourcing/discover', { method: 'POST', body }); renderSourcing(d); }
  catch (e) { onErr(e); }
}
window._cands = {};
function renderSourcing(d) {
  const box = $('#sourcingBody'); if (!box) return;
  if (!d.candidates.length) { box.innerHTML = '<div class="card"><p class="muted">후보를 찾지 못했습니다. 조건을 바꿔 다시 시도하세요.</p></div>'; return; }
  window._cands = {};
  box.innerHTML = `<div class="card">
    <h3>소싱 후보 (${d.candidates.length}, 점수순)</h3>
    <p class="muted">소싱점수 = 수요 35% + 마진 40% + 경쟁우위 25%. 환율 1 USD=₩${d.fxKRW.toLocaleString()}.</p>
    <table><tr><th>점수</th><th>후보 상품</th><th>시장 평균가</th><th>경쟁</th><th>예상원가</th><th>추천 판매가</th><th>예상마진</th><th>근거</th><th></th></tr>
    ${d.candidates.map((c, i) => { window._cands[i] = c; const cur = c.currency === 'USD' ? '$' : '₩';
      const scoreCls = c.sourcingScore >= 67 ? 'ok' : c.sourcingScore >= 40 ? 'warn' : 'no';
      return `<tr>
        <td><span class="pill ${scoreCls}">${c.sourcingScore}</span></td>
        <td>${esc(c.idea)}${c.budgetOver ? ' <span class="pill warn">예산초과</span>' : ''}</td>
        <td>${cur}${c.marketAvg.toLocaleString()}</td>
        <td>${c.competition}곳</td>
        <td>₩${c.estCostKRW.toLocaleString()}</td>
        <td class="result-ok">${cur}${c.suggestedPrice.toLocaleString()}</td>
        <td>${c.estMarginPct}%</td>
        <td class="muted" style="white-space:normal;max-width:220px">${esc(c.reason)}</td>
        <td><button class="btn-primary" onclick="addCandidate(${i})">상품 등록</button></td>
      </tr>`; }).join('')}
    </table>
  </div>`;
}
async function addCandidate(i) {
  const cand = window._cands[i]; if (!cand) return;
  try { const d = await api('/api/sourcing/add', { method: 'POST', body: { candidate: cand } });
    toast(`"${cand.idea}" 상품으로 등록 — 상세정보 보완 후 업로드하세요`, 'ok'); }
  catch (e) { onErr(e); }
}

function csvDownload(path, fallbackName) {
  fetch(path, { headers: { Authorization: 'Bearer ' + TOKENS.access } })
    .then(r => r.ok ? r.blob().then(b => ({ b, name: (r.headers.get('content-disposition') || '').match(/filename\*=UTF-8''([^;]+)/) })) : Promise.reject(new Error('다운로드 실패')))
    .then(({ b, name }) => { const url = URL.createObjectURL(b); const a = el('a', { href: url, download: name ? decodeURIComponent(name[1]) : fallbackName }); document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); })
    .catch(e => toast(e.message, 'err'));
}

let COMP_MARKET = '';
function viewCompetitors() {
  const mkts = ['', 'amazon', 'ebay', 'coupang', 'naver', 'openmarket', 'ownmall'];
  return `
  <h1>경쟁 분석</h1>
  <p class="sub">올리려는 상품과 같거나 비슷한 상품을 찾아 가격을 비교하고, 경쟁력 높은 순으로 정렬합니다.</p>
  <div class="tabbar">
    ${mkts.map(m => `<button class="${COMP_MARKET === m ? 'active' : ''}" onclick="setCompMarket('${m}')">${m ? (MARKET_LABEL[m] || m) : '대표 마켓'}</button>`).join('')}
    <button class="btn-primary" onclick="loadCompetitors()">새로고침</button>
    <button class="btn-blue" onclick="runTrack()">지금 추적 실행</button>
  </div>
  <div id="compAlerts"></div>
  <div id="compBody"><p class="muted">경쟁 상품을 검색하는 중...</p></div>
  <div id="compDetail"></div>`;
}
function setCompMarket(m) { COMP_MARKET = m; render(); }
async function loadCompetitors() {
  const body = $('#compBody'); if (body) body.innerHTML = '<p class="muted">경쟁 상품을 검색하는 중...</p>';
  try {
    const d = await api('/api/competitors/rank' + (COMP_MARKET ? '?market=' + COMP_MARKET : '')); renderCompRank(d.rows);
    const w = await api('/api/competitors/watch'); renderAlerts(w.alerts);
  } catch (e) { onErr(e); }
}
function renderAlerts(alerts) {
  const box = $('#compAlerts'); if (!box) return;
  if (!alerts || !alerts.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="card" style="border-left:4px solid var(--accent)"><h3>가격 변동 알림</h3>
    ${alerts.slice(0, 10).map(a => `<div style="padding:6px 0;border-bottom:1px solid var(--line)"><span class="pill ${a.type === 'repriced' ? 'ok' : 'warn'}">${a.type === 'repriced' ? '자동조정' : '하락'}</span> ${esc(a.msg)} <span class="muted">${new Date(a.at).toLocaleString('ko-KR')}</span></div>`).join('')}
  </div>`;
}
async function runTrack() {
  toast('경쟁가 추적 실행 중...', '');
  try { const d = await api('/api/competitors/track', { method: 'POST', body: {} });
    toast(`추적 ${d.checked}건 · 알림 ${d.alerts.length} · 자동조정 ${d.repriced}`, 'ok'); loadCompetitors(); }
  catch (e) { onErr(e); }
}
async function toggleAutoReprice(id, on) {
  const prod = STATE.products.find(p => p.id === id); if (!prod) return;
  const body = { ...prod, autoReprice: on }; delete body._valid;
  try { await api('/api/products', { method: 'POST', body }); toast(`자동 리프라이스 ${on ? 'ON' : 'OFF'}: ${prod.sku}`, 'ok'); }
  catch (e) { onErr(e); }
}
function scorePill(s) {
  if (s == null) return '<span class="pill warn">가격없음</span>';
  const cls = s >= 67 ? 'ok' : s >= 34 ? 'warn' : 'no';
  return `<span class="pill ${cls}">${s}점</span>`;
}
function cur(v, c) { return v == null ? '-' : (c === 'USD' ? '$' + Number(v).toFixed(2) : '₩' + Number(v).toLocaleString()); }
function renderCompRank(rows) {
  const body = $('#compBody'); if (!body) return;
  if (!rows.length) { body.innerHTML = '<div class="card"><p class="muted">상품이 없습니다. 먼저 상품을 추가하세요.</p></div>'; return; }
  body.innerHTML = `<div class="card">
    <h3>상품 경쟁력 순위 (${rows.length})</h3>
    <p class="muted">경쟁력 점수 = 경쟁사 대비 내 가격이 저렴한 정도(100에 가까울수록 최저가권).</p>
    <table><tr><th>경쟁력</th><th>SKU</th><th>상품</th><th>마켓</th><th>내 가격</th><th>시장 최저</th><th>시장 평균</th><th>내 순위</th><th>추천가</th><th>자동조정</th><th></th></tr>
    ${rows.map(r => { const prod = (STATE.products || []).find(p => p.id === r.id) || {}; return `<tr>
      <td>${scorePill(r.score)}</td>
      <td><code>${esc(r.sku)}</code></td>
      <td>${esc(r.title)}</td>
      <td>${esc(MARKET_LABEL[r.market] || r.market)}</td>
      <td>${cur(r.myPrice, r.currency)}</td>
      <td>${cur(r.marketMin, r.currency)}</td>
      <td>${cur(r.marketAvg, r.currency)}</td>
      <td>${r.position || '-'}</td>
      <td class="result-ok">${cur(r.suggested, r.currency)}</td>
      <td><input type="checkbox" ${prod.autoReprice ? 'checked' : ''} onchange="toggleAutoReprice('${r.id}', this.checked)" style="width:auto"></td>
      <td><button class="btn-ghost" onclick="compareOne('${r.id}','${r.market}')">상세</button></td>
    </tr>`; }).join('')}
    </table>
  </div>`;
}
async function compareOne(id, market) {
  const box = $('#compDetail'); if (box) box.innerHTML = '<p class="muted">불러오는 중...</p>';
  try {
    const d = await api('/api/competitors/compare?id=' + encodeURIComponent(id) + '&market=' + market);
    const s = d.stats || {};
    box.innerHTML = `<div class="card">
      <h3>${esc(d.title)} — ${esc(MARKET_LABEL[d.market] || d.market)} 경쟁 비교</h3>
      <p class="muted">검색어: "${esc(d.query)}" · 출처: ${esc(d.provider)}</p>
      <div class="grid3">
        <div class="stat"><div class="n">${scorePill(d.score)}</div><div class="l">경쟁력 점수</div></div>
        <div class="stat"><div class="n">${d.position || '-'}</div><div class="l">내 가격 순위</div></div>
        <div class="stat"><div class="n result-ok">${cur(d.suggested, d.currency)}</div><div class="l">추천 판매가</div></div>
      </div>
      <p style="margin-top:10px">내 가격 <b>${cur(d.myPrice, d.currency)}</b> · 시장 최저 ${cur(s.min, d.currency)} / 평균 ${cur(s.avg, d.currency)} / 중앙 ${cur(s.median, d.currency)} / 최고 ${cur(s.max, d.currency)}</p>
      <h3 style="margin-top:14px">경쟁 상품 (${d.competitors.length}, 저가순)</h3>
      <table><tr><th>#</th><th>상품명</th><th>판매자</th><th>가격</th><th>평점</th><th>리뷰</th><th></th></tr>
      ${d.competitors.map((c, i) => `<tr style="${d.myPrice > 0 && c.price < d.myPrice ? 'color:var(--err)' : ''}">
        <td>${i + 1}</td><td>${esc(c.title)}</td><td class="muted">${esc(c.seller || '')}</td>
        <td>${cur(c.price, c.currency)}</td><td>${c.rating != null ? c.rating : '-'}</td><td>${c.reviews != null ? c.reviews.toLocaleString() : '-'}</td>
        <td>${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">보기</a>` : ''}</td>
      </tr>`).join('')}</table>
      <p class="muted" style="margin-top:8px">빨간 줄 = 나보다 싼 경쟁 상품. 추천가로 맞추면 최저가권에 진입합니다.</p>
      ${d.suggested ? `<button class="btn-primary" style="margin-top:10px" onclick="applySuggested('${esc(d.sku)}', ${d.suggested}, '${d.currency}')">추천가를 이 상품에 적용</button>` : ''}
    </div>`;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) { onErr(e); }
}
async function applySuggested(sku, price, currency) {
  const prod = STATE.products.find(p => p.sku === sku); if (!prod) return;
  const body = { ...prod }; delete body._valid;
  if (currency === 'USD') body.price_usd = price; else body.price = price;
  try { await api('/api/products', { method: 'POST', body }); toast(`${sku} 가격을 ${cur(price, currency)}로 적용`, 'ok'); loadCompetitors(); }
  catch (e) { onErr(e); }
}

const CARRIERS = ['CJ대한통운', '한진택배', '롯데택배', '우체국택배', 'USPS', 'UPS', 'FedEx', 'DHL'];
function viewShipping() {
  return `
  <h1>배송 처리</h1>
  <p class="sub">미출고 주문에 택배사·송장번호를 넣고 출고 확정하면 해당 마켓에 자동 반영됩니다.</p>
  <div class="tabbar">
    <button id="sh_unshipped" class="active" onclick="setShipTab('unshipped')">미출고</button>
    <button id="sh_shipped" onclick="setShipTab('shipped')">출고완료</button>
  </div>
  <div id="shippingBody"><p class="muted">불러오는 중...</p></div>`;
}
let SHIP_TAB = 'unshipped';
function setShipTab(t) { SHIP_TAB = t; $('#sh_unshipped').classList.toggle('active', t === 'unshipped'); $('#sh_shipped').classList.toggle('active', t === 'shipped'); loadShipping(); }
async function loadShipping() {
  try { const d = await api('/api/orders?status=' + SHIP_TAB); renderShipping(d.orders); }
  catch (e) { onErr(e); }
}
function renderShipping(orders) {
  const body = $('#shippingBody'); if (!body) return;
  if (!orders.length) { body.innerHTML = `<div class="card"><p class="muted">${SHIP_TAB === 'unshipped' ? '미출고 주문이 없습니다. 판매 현황에서 주문을 먼저 동기화하세요.' : '출고완료 주문이 없습니다.'}</p></div>`; return; }
  if (SHIP_TAB === 'shipped') {
    body.innerHTML = `<div class="card"><table><tr><th>주문번호</th><th>마켓</th><th>상품</th><th>택배사</th><th>송장</th><th>출고일</th></tr>
      ${orders.map(o => `<tr><td><code>${esc(o.orderId)}</code></td><td>${esc(MARKET_LABEL[o.market] || o.market)}</td><td>${esc(o.title || o.sku || '-')}</td><td>${esc(o.carrier || '')}</td><td>${esc(o.tracking || '')}</td><td>${o.shippedAt ? new Date(o.shippedAt).toLocaleDateString('ko-KR') : '-'}</td></tr>`).join('')}</table></div>`;
    return;
  }
  body.innerHTML = `<div class="card"><table><tr><th>주문번호</th><th>마켓</th><th>상품</th><th>택배사</th><th>송장번호</th><th></th></tr>
    ${orders.map(o => `<tr>
      <td><code>${esc(o.orderId)}</code></td><td>${esc(MARKET_LABEL[o.market] || o.market)}</td><td>${esc(o.title || o.sku || '-')}</td>
      <td><select id="car_${esc(o.orderId)}" style="min-width:120px">${CARRIERS.map(c => `<option>${c}</option>`).join('')}</select></td>
      <td><input id="trk_${esc(o.orderId)}" placeholder="송장번호" style="width:140px"></td>
      <td><button class="btn-primary" onclick="shipOrder('${esc(o.orderId)}')">출고 확정</button></td>
    </tr>`).join('')}</table></div>`;
}
async function shipOrder(orderId) {
  const carrier = $('#car_' + orderId).value, tracking = $('#trk_' + orderId).value.trim();
  if (!tracking) return toast('송장번호를 입력하세요', 'err');
  try { const d = await api('/api/orders/ship', { method: 'POST', body: { orderId, carrier, tracking } });
    toast(`출고 확정: ${d.result.status || 'OK'} (${d.result.provider})`, 'ok'); loadShipping(); }
  catch (e) { onErr(e); }
}

function viewPricing() {
  return `
  <h1>가격 규칙</h1>
  <p class="sub">원가(KRW)에 환율·마켓 수수료·마진을 반영해 마켓별 판매가를 자동 산출합니다. ${STATE.billing.isAdmin ? '' : '규칙 변경은 관리자만 가능합니다.'}</p>
  <div id="pricingBody"><p class="muted">불러오는 중...</p></div>`;
}
async function loadPricing() {
  try { const d = await api('/api/pricing/preview'); renderPricing(d); }
  catch (e) { onErr(e); }
}
function renderPricing(d) {
  const body = $('#pricingBody'); if (!body) return;
  const isAdmin = STATE.billing.isAdmin;
  const markets = Object.keys(d.rules);
  const ruleCards = markets.map(m => {
    const r = d.rules[m];
    return `<div class="stat">
      <div style="font-weight:700;margin-bottom:6px">${esc(MARKET_LABEL[m] || m)} <span class="muted">(${r.currency})</span></div>
      <label>수수료 %</label><input id="fee_${m}" type="number" value="${r.feePct}" ${isAdmin ? '' : 'disabled'}>
      <label>마진 %</label><input id="mar_${m}" type="number" value="${r.marginPct}" ${isAdmin ? '' : 'disabled'}>
      <label>배송비(₩, 건당)</label><input id="shp_${m}" type="number" value="${r.shipKRW || 0}" ${isAdmin ? '' : 'disabled'}>
      <label>기타 부대비(₩)</label><input id="ext_${m}" type="number" value="${r.extraKRW || 0}" ${isAdmin ? '' : 'disabled'}>
      <label>반올림</label><input id="rnd_${m}" value="${r.round}" ${isAdmin ? '' : 'disabled'}>
      ${isAdmin ? `<button class="btn-ghost" style="margin-top:8px;width:100%" onclick="saveRule('${m}')">규칙 저장</button>` : ''}
    </div>`;
  }).join('');
  body.innerHTML = `
  <div class="card"><h3>환율</h3><p>1 USD = <b>₩${Math.round(d.fx.KRW).toLocaleString()}</b> <span class="pill ${d.fx.source === 'live' ? 'ok' : 'warn'}">${d.fx.source === 'live' ? '실시간' : '폴백'}</span></p></div>
  <div class="card"><h3>마켓별 규칙</h3><div class="grid3">${ruleCards}</div></div>
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <h3 style="margin:0">계산 미리보기</h3>
      <div><button class="btn-blue" onclick="applyPricing(false)">상품가에 적용</button> <button class="btn-primary" onclick="applyPricing(true)">적용 + 마켓 반영</button></div>
    </div>
    ${d.rows.some(r => r.cost) ? `<table><tr><th>SKU</th><th>원가(₩)</th>${markets.map(m => `<th>${esc(MARKET_LABEL[m] || m)}</th>`).join('')}</tr>
      ${d.rows.map(r => `<tr><td><code>${esc(r.sku)}</code></td><td>${r.cost ? r.cost.toLocaleString() : '<span class="muted">미설정</span>'}</td>
        ${markets.map(m => { const v = r.prices[m]; return `<td>${v ? (v.currency === 'USD' ? '$' + v.price.toFixed(2) : '₩' + v.price.toLocaleString()) : '-'}</td>`; }).join('')}</tr>`).join('')}
    </table>` : '<p class="muted">원가(cost)가 설정된 상품이 없습니다. 상품 추가/수정에서 원가(₩)를 입력하세요.</p>'}
  </div>
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
      <h3 style="margin:0">경쟁 최저가 언더컷 재책정</h3>
      <div><button class="btn-blue" onclick="runCompetitive(false)">미리보기</button> <button class="btn-primary" onclick="runCompetitive(true)">전체 적용</button></div>
    </div>
    <p class="muted">사입가와 무관하게 같은·비슷한 상품 최저가보다 ${STATE.config.undercutPct}% 싸게 책정하고, 배송비 별도 순마진 ${STATE.config.undercutMinMarginPct}% 미만은 보류합니다. 경쟁 제품이 없으면 원가의 2배로 책정합니다. 기준은 연동 설정에서 변경.</p>
    <div id="compBody"></div>
  </div>`;
}
async function runCompetitive(apply) {
  if (apply && !confirm('모든 상품을 경쟁 최저가 언더컷으로 재책정하고, 마진 미달은 보류 처리할까요?')) return;
  const box = $('#compBody'); if (box) box.innerHTML = '<p class="muted">경쟁 최저가 조회·계산 중…</p>';
  try {
    const d = await api('/api/competitive/price', { method: 'POST', body: { apply } });
    const rows = d.rows.filter(r => !r.noComp);
    box.innerHTML = `<p class="muted">언더컷 ${d.undercutPct}% · 최소마진 ${d.minMarginPct}%(배송비 별도) · 통과 <b class="result-ok">${d.passed}</b> · 보류 <b class="result-no">${d.belowCount}</b>${apply ? ' · 적용됨' : ' · 미리보기(미적용)'}</p>
      ${rows.length ? `<table><tr><th>SKU</th><th>상품</th><th>경쟁최저가</th><th>책정가(-${d.undercutPct}%)</th><th>마진</th><th>상태</th></tr>
      ${rows.slice(0, 50).map(r => { const pm = Object.values(r.perMarket).find(x => x.suggested) || {}; const cur = pm.currency === 'USD' ? '$' : '₩'; return `<tr><td>${esc(r.sku)}</td><td>${esc((r.title || '').slice(0, 24))}</td><td>${pm.lowestComp != null ? cur + pm.lowestComp.toLocaleString() : '-'}</td><td>${pm.suggested != null ? cur + pm.suggested.toLocaleString() : '-'}</td><td class="${r.belowMin ? 'result-no' : 'result-ok'}">${r.worstMarginPct == null ? '-' : r.worstMarginPct + '%'}</td><td>${r.belowMin ? '<span class="pill no">보류</span>' : '<span class="pill ok">통과</span>'}</td></tr>`; }).join('')}</table>`
      : '<p class="muted">경쟁 상품을 찾지 못했습니다. (상품명이 비어있거나 검색 연동 전)</p>'}`;
    if (apply) { const s = await api('/api/state'); STATE = s.state; }
  } catch (e) { box.innerHTML = ''; onErr(e); }
}
async function saveRule(market) {
  const rule = { feePct: Number($('#fee_' + market).value), marginPct: Number($('#mar_' + market).value), shipKRW: Number($('#shp_' + market).value), extraKRW: Number($('#ext_' + market).value), round: $('#rnd_' + market).value };
  try { await api('/api/pricing/rule', { method: 'POST', body: { market, rule } }); toast(`${MARKET_LABEL[market] || market} 규칙 저장`, 'ok'); loadPricing(); }
  catch (e) { onErr(e); }
}
async function applyPricing(push) {
  if (!confirm(push ? '계산된 가격을 상품에 적용하고 각 마켓에 반영할까요?' : '계산된 가격을 상품가에 적용할까요?')) return;
  toast('적용 중...', '');
  try { const d = await api('/api/pricing/apply', { method: 'POST', body: { push } });
    toast(`${d.applied}개 상품 가격 적용${push ? ` · ${d.pushed}/${d.pushTotal} 마켓 반영` : ''}`, 'ok'); loadPricing(); }
  catch (e) { onErr(e); }
}

function viewInventory() {
  const log = STATE.inventoryLog || [];
  const lowT = (STATE.notif && STATE.notif.lowThreshold != null) ? STATE.notif.lowThreshold : 10;
  let p = STATE.products;
  if (INV_LOW_ONLY) p = p.filter(x => (x.stock || 0) <= lowT);
  return `
  <h1>재고 관리</h1>
  <p class="sub">한 곳에서 재고를 바꾸면 그 상품이 올라간 모든 마켓에 수량이 자동 반영됩니다. 재고 임계값 이하는 부족으로 표시됩니다.</p>
  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
      <h3 style="margin:0">상품 재고 (${p.length}${INV_LOW_ONLY ? ' · 부족만' : ''})</h3>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <label style="margin:0;display:flex;align-items:center;gap:5px"><input type="checkbox" ${INV_LOW_ONLY ? 'checked' : ''} onclick="INV_LOW_ONLY=this.checked;render()" style="width:auto"> 부족만</label>
        ${STATE.billing.isAdmin ? `<span class="muted">임계값</span><input id="lowT" type="number" value="${lowT}" style="width:70px"><button class="btn-ghost" onclick="saveLowT()">저장</button>` : `<span class="muted">임계 ${lowT}</span>`}
        <button class="btn-ghost" onclick="syncSourceStock()">소스 품절 체크</button>
        <button class="btn-primary" onclick="syncAllInventory()">전체 동기화</button>
      </div>
    </div>
    ${p.length ? `<table>
      <tr><th>SKU</th><th>상품</th><th>마켓</th><th>재고</th><th></th></tr>
      ${p.map(x => `<tr>
        <td><code>${esc(x.sku)}</code></td>
        <td>${esc(x.title_en || x.title)}</td>
        <td class="muted">${(x.markets || ['amazon']).map(m => MARKET_LABEL[m] || m).join(', ')}</td>
        <td><input id="inv_${x.id}" type="number" value="${x.stock}" style="width:90px"> ${(x.stock || 0) <= lowT ? '<span class="pill no">부족</span>' : ''}</td>
        <td><button class="btn-blue" onclick="pushStock('${x.id}')">전 마켓 반영</button></td>
      </tr>`).join('')}
    </table>` : '<p class="muted">해당 상품이 없습니다.</p>'}
  </div>
  <div class="card"><h3>최근 재고 반영 이력</h3>
    ${log.length ? `<table><tr><th>시각</th><th>SKU</th><th>재고</th><th>마켓 반영</th></tr>
      ${log.map(l => `<tr><td>${new Date(l.at).toLocaleString('ko-KR')}</td><td><code>${esc(l.sku)}</code></td><td>${l.stock == null ? '-' : l.stock}</td><td class="muted">${(l.pushes || []).map(ps => `${MARKET_LABEL[ps.market] || ps.market}:${ps.ok ? 'OK' : '실패'}`).join(', ')}</td></tr>`).join('')}
    </table>` : '<p class="muted">아직 이력이 없습니다.</p>'}
  </div>`;
}
let INV_LOW_ONLY = false;
async function saveLowT() {
  try { await api('/api/settings/lowstock', { method: 'POST', body: { threshold: $('#lowT').value } }); toast('임계값 저장', 'ok'); const s = await api('/api/state'); STATE = s.state; render(); }
  catch (e) { onErr(e); }
}
async function pushStock(id) {
  const v = $('#inv_' + id).value;
  try { const d = await api('/api/inventory/update', { method: 'POST', body: { id, stock: v } });
    const okc = d.pushes.filter(x => x.ok).length;
    toast(`재고 ${d.stock} 반영 — ${okc}/${d.pushes.length} 마켓 성공`, 'ok'); render(); }
  catch (e) { onErr(e); }
}
async function syncAllInventory() {
  toast('전체 재고 동기화 중...', '');
  try { const d = await api('/api/inventory/sync-all', { method: 'POST', body: {} });
    toast(`전체 동기화: ${d.okCount}/${d.total} 반영`, 'ok'); render(); }
  catch (e) { onErr(e); }
}
async function syncSourceStock() {
  toast('소스몰 품절 체크 중...', '');
  try { const d = await api('/api/inventory/sync-source', { method: 'POST', body: {} });
    toast(`체크 ${d.checked}개 · 품절처리 ${d.soldOut}개`, 'ok'); render(); }
  catch (e) { onErr(e); }
}

let SALES_DAYS = 30, SALES_MARKET = 'all';
const MARKET_LABEL = { all: '전체', amazon: '아마존', ebay: 'eBay', coupang: '쿠팡', naver: '스마트스토어', openmarket: '오픈마켓', ownmall: '자체몰' };
function viewSales() {
  return `
  <h1>판매 현황</h1>
  <p class="sub">아마존 주문을 동기화해 매출·주문·베스트 상품을 봅니다. ${STATE.config.amazonProvider === 'spapi' ? '실제 SP-API 주문' : '데모 주문(SP-API 연동 시 실주문)'}</p>
  <div class="tabbar">
    <button onclick="setSalesDays(7)" class="${SALES_DAYS === 7 ? 'active' : ''}">7일</button>
    <button onclick="setSalesDays(30)" class="${SALES_DAYS === 30 ? 'active' : ''}">30일</button>
    <button onclick="setSalesDays(90)" class="${SALES_DAYS === 90 ? 'active' : ''}">90일</button>
    <button class="btn-primary" onclick="doSyncOrders()">주문 동기화</button>
    <button class="btn-ghost" onclick="csvDownload('/api/export/sales.csv?days=' + SALES_DAYS, 'sales.csv')">CSV 내보내기</button>
  </div>
  <div id="salesBody"><p class="muted">불러오는 중...</p></div>`;
}
function setSalesDays(d) { SALES_DAYS = d; render(); }
async function loadSales() {
  try { const d = await api('/api/sales?days=' + SALES_DAYS + '&market=' + SALES_MARKET); renderSales(d.sales); }
  catch (e) { onErr(e); }
}
async function doSyncOrders() {
  toast('주문 동기화 중...', '');
  try { const d = await api('/api/amazon/orders/sync', { method: 'POST', body: { days: SALES_DAYS } });
    const prov = Object.entries(d.providers || {}).map(([m, p]) => (MARKET_LABEL[m] || m) + ':' + p).join(', ');
    toast(`주문 ${d.count}건 동기화 (${prov})`, 'ok'); SALES_MARKET = 'all'; loadSales(); }
  catch (e) { onErr(e); }
}
function setSalesMarket(m) { SALES_MARKET = m; loadSales(); }
function renderSales(s) {
  const body = $('#salesBody'); if (!body) return;
  const cur = (s.markets || []).includes(SALES_MARKET) ? SALES_MARKET : 'all';
  const filter = (s.markets && s.markets.length > 1) ? `<div class="tabbar" style="margin-bottom:14px">${s.markets.map(m => `<button class="${cur === m ? 'active' : ''}" onclick="setSalesMarket('${m}')">${esc(MARKET_LABEL[m] || m)}</button>`).join('')}</div>` : '';
  if (!s.orders) {
    body.innerHTML = filter + `<div class="card"><p class="muted">주문 데이터가 없습니다. "주문 동기화"를 누르면 최근 ${s.days}일 주문을 불러옵니다.</p></div>`;
    return;
  }
  const unit = (cur === 'coupang' || cur === 'naver' || cur === 'openmarket') ? '₩' : '$';
  const byMarketCard = (s.byMarket && s.byMarket.length > 1) ? `<div class="card"><h3>마켓별 매출</h3>${hbars(s.byMarket.map(x => ({ label: MARKET_LABEL[x.market] || x.market, value: x.revenue, sub: '' })))}</div>` : '';
  body.innerHTML = filter + `
  <div class="grid3">
    <div class="stat"><div class="n" style="color:var(--accent)">${unit}${s.revenue.toLocaleString()}</div><div class="l">매출 (${s.days}일)</div></div>
    <div class="stat"><div class="n">${s.orders}</div><div class="l">주문 수</div></div>
    <div class="stat"><div class="n">${unit}${s.aov.toFixed(2)}</div><div class="l">평균 주문금액</div></div>
  </div>
  ${byMarketCard}
  <div class="card"><h3>일별 매출</h3>${barChart(s.byDay.map(d => ({ label: d.day, value: d.revenue })), unit)}</div>
  <div class="card"><h3>베스트 상품</h3>${s.topProducts.length ? hbars(s.topProducts.map(p => ({ label: p.title, value: p.revenue, sub: p.units + '개' }))) : '<p class="muted">판매된 상품이 없습니다.</p>'}</div>
  <div class="card"><h3>최근 주문</h3>${s.recent.length ? `<table><tr><th>주문번호</th><th>마켓</th><th>일시</th><th>상품</th><th>수량</th><th>금액</th></tr>${s.recent.map(o => `<tr><td><code>${esc(o.orderId)}</code></td><td>${esc(MARKET_LABEL[o.market] || o.market || '-')}</td><td>${new Date(o.at).toLocaleDateString('ko-KR')}</td><td>${esc(o.title || o.sku || '-')}</td><td>${o.items}</td><td>${(o.currency === 'KRW' ? '₩' : '$')}${(o.total || 0).toLocaleString()}</td></tr>`).join('')}</table>` : '<p class="muted">없음</p>'}</div>`;
}
// 세로 막대 차트 (단일 시리즈 → 범례 없음, 고딕·이탤릭 없음)
function barChart(data, unit) {
  if (!data.length) return '<p class="muted">데이터 없음</p>';
  const max = Math.max(1, ...data.map(d => d.value));
  const W = Math.max(data.length * 26 + 40, 320), H = 180, pad = 24, bw = Math.max(6, (W - 40) / data.length - 6);
  const bars = data.map((d, i) => {
    const h = Math.round((d.value / max) * (H - pad * 2));
    const x = 30 + i * ((W - 40) / data.length), y = H - pad - h;
    const showLabel = data.length <= 16 || i % Math.ceil(data.length / 16) === 0;
    return `<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(h, 1)}" rx="4" fill="var(--accent)"><title>${esc(d.label)}: ${unit}${d.value.toLocaleString()}</title></rect>
      ${showLabel ? `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="9" fill="var(--muted)">${esc(d.label)}</text>` : ''}`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:100%;overflow:visible" role="img" aria-label="일별 매출 막대그래프">
    <line x1="30" y1="${H - pad}" x2="${W - 10}" y2="${H - pad}" stroke="var(--line)" stroke-width="1"/>
    ${bars}</svg>`;
}
// 가로 막대 (베스트 상품)
function hbars(data) {
  const max = Math.max(1, ...data.map(d => d.value));
  return `<div style="display:flex;flex-direction:column;gap:10px">${data.map(d => {
    const pct = Math.round(d.value / max * 100);
    return `<div><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:3px"><span>${esc(d.label)}</span><span class="muted">$${d.value.toLocaleString()} · ${esc(d.sub || '')}</span></div>
      <div style="background:var(--panel2);border-radius:6px;height:14px;overflow:hidden"><div style="width:${pct}%;height:100%;background:var(--accent2)"></div></div></div>`;
  }).join('')}</div>`;
}

function bar(cur, max) {
  if (max === -1) return `<div class="muted">${cur} / 무제한</div>`;
  const pct = Math.min(100, Math.round(cur / max * 100));
  const col = pct >= 100 ? 'var(--err)' : pct >= 80 ? 'var(--warn)' : 'var(--ok)';
  return `<div style="background:var(--panel2);border-radius:6px;height:10px;overflow:hidden;margin-top:4px"><div style="width:${pct}%;height:100%;background:${col}"></div></div><div class="muted" style="margin-top:3px">${cur} / ${max}</div>`;
}

function viewBilling() {
  const b = STATE.billing, mock = STATE.config.billingMock;
  if (b.isAdmin) {
    return `<h1>요금제</h1><p class="sub">관리자(내 계정) 상태입니다.</p>
    <div class="card"><h3>엔터프라이즈 (내부)</h3>
      <p><span class="pill ok">무료 · 무제한</span></p>
      <p class="muted">관리자 계정은 상품 수·업로드·AI 생성 한도가 없으며 과금되지 않습니다.</p>
    </div>
    ${adminRevenueCard()}`;
  }
  const u = b.usage, l = b.limits, sub = b.sub || {};
  const canTrial = !sub.trialUsed;
  const cards = ['free', 'pro', 'business'].map(k => {
    const p = b.plans[k], cur = b.plan === k;
    let btn = '';
    if (cur) btn = '';
    else if (k === 'free') btn = `<button class="btn-ghost" style="margin-top:10px;width:100%" onclick="cancelSub()">이 요금제로 내리기</button>`;
    else if (canTrial) btn = `<button class="btn-primary" style="margin-top:10px;width:100%" onclick="startTrial('${k}')">14일 무료 체험</button>`;
    else btn = `<button class="btn-primary" style="margin-top:10px;width:100%" onclick="subscribe('${k}')">업그레이드</button>`;
    return `<div class="method ${cur ? 'sel' : ''}">
      <div class="t">${esc(p.label)} ${cur ? '<span class="pill ok">사용 중</span>' : ''}</div>
      <div style="font-size:22px;font-weight:800;margin:6px 0">${p.priceKRW ? '₩' + p.priceKRW.toLocaleString() + '<span class="muted" style="font-size:12px">/월</span>' : '무료'}</div>
      <div class="d">상품 ${p.maxProducts === -1 ? '무제한' : p.maxProducts + '개'}<br>월 업로드 ${p.maxUploadsPerMonth === -1 ? '무제한' : p.maxUploadsPerMonth + '회'}<br>월 AI생성 ${p.aiPerMonth === -1 ? '무제한' : p.aiPerMonth + '회'}<br>SP-API 자동등록 ${p.api ? '○' : '×'}</div>
      ${btn}
    </div>`;
  }).join('');
  let banner = '';
  if (sub.status === 'trialing') banner = `<div class="card" style="border-left:4px solid var(--accent)"><b>${esc(b.planLabel)} 무료 체험 중</b> — 남은 기간 ${sub.trialDaysLeft}일. 체험이 끝나면 자동으로 무료 요금제로 전환됩니다.${mock ? '' : ' 계속 쓰려면 결제를 등록하세요.'}</div>`;
  else if (sub.status === 'expired') banner = `<div class="card" style="border-left:4px solid var(--warn)"><b>무료 체험이 종료되었습니다</b> — 현재 무료 요금제입니다. 업그레이드하면 다시 이용할 수 있습니다.</div>`;
  else if (sub.status === 'past_due') banner = `<div class="card" style="border-left:4px solid var(--err)"><b>결제 실패</b> — 결제 수단을 확인해 주세요.</div>`;
  return `
  <h1>요금제</h1>
  <p class="sub">현재 요금제: <b>${esc(b.planLabel)}</b>${mock ? ' <span class="pill warn">목업 결제 모드</span>' : ''}</p>
  ${banner}
  <div class="card"><h3>이번 달 사용량</h3>
    <div class="grid3">
      <div><label>상품 수</label>${bar(u.products, l.maxProducts)}</div>
      <div><label>월 업로드</label>${bar(u.uploads, l.maxUploadsPerMonth)}</div>
      <div><label>월 AI 생성</label>${bar(u.ai, l.aiPerMonth)}</div>
    </div>
  </div>
  <div class="method-cards">${cards}</div>
  ${mock ? '<p class="muted">목업 결제 모드에서는 업그레이드가 결제 없이 즉시 적용됩니다. 실결제는 서버에 STRIPE_SECRET_KEY를 설정하면 활성화됩니다.</p>' : ''}`;
}
function adminRevenueCard() {
  const s = STATE.adminStats; if (!s) return '';
  const planRows = Object.keys(s.byPlan).filter(k => k !== 'enterprise').map(k => `<tr><td>${esc(k)}</td><td>${s.byPlan[k]}</td></tr>`).join('');
  return `<div class="card"><h3>매출 현황</h3>
    <div class="grid3">
      <div class="stat"><div class="n">${s.sellers}</div><div class="l">셀러</div></div>
      <div class="stat"><div class="n result-ok">${s.paidSubs}</div><div class="l">유료 구독</div></div>
      <div class="stat"><div class="n" style="color:var(--accent)">₩${(s.mrr || 0).toLocaleString()}</div><div class="l">MRR(월 반복매출)</div></div>
    </div>
    <p class="muted" style="margin-top:8px">체험 중: ${s.trialing || 0}명</p>
    <table style="margin-top:12px"><tr><th>요금제</th><th>구독 수</th></tr>${planRows}</table>
  </div>`;
}
async function subscribe(plan) {
  try {
    const d = await api('/api/billing/checkout', { method: 'POST', body: { plan } });
    if (d.url) { location.href = d.url; return; } // 실결제: Stripe Checkout
    // 목업: dev-activate
    await api('/api/billing/dev-activate', { method: 'POST', body: { plan } });
    toast(plan + ' 요금제로 전환되었습니다', 'ok'); render();
  } catch (e) { onErr(e); }
}
async function startTrial(plan) {
  try { const d = await api('/api/billing/start-trial', { method: 'POST', body: { plan } }); toast(`${plan} 14일 무료 체험이 시작되었습니다`, 'ok'); render(); }
  catch (e) { onErr(e); }
}
async function cancelSub() {
  if (!confirm('무료 요금제로 내릴까요?')) return;
  try { await api('/api/billing/cancel', { method: 'POST', body: {} }); toast('무료 요금제로 전환되었습니다', 'ok'); render(); }
  catch (e) { onErr(e); }
}

function viewSettings() {
  const a = STATE.me.amazon;
  return `
  <h1>연동 설정</h1>
  <p class="sub">아마존 계정과 업로드 방식을 설정합니다. 플랫파일 방식은 설정 없이 바로 사용 가능.</p>
  <div class="card">
    <h3>아마존 SP-API (정식 연동)</h3>
    <p class="muted">아마존 셀러 계정에서 발급한 SP-API 자격증명을 입력하면 상품이 자동 등록됩니다.</p>
    <div class="row">${field('s_sellerId', 'Seller ID', a.sellerId)}${field('s_market', 'Marketplace ID', a.marketplaceId || 'ATVPDKIKX0DER')}</div>
    <div class="row"><div><label>리전</label><select id="s_region"><option value="na" ${a.region === 'na' ? 'selected' : ''}>북미(na)</option><option value="eu" ${a.region === 'eu' ? 'selected' : ''}>유럽(eu)</option><option value="fe" ${a.region === 'fe' ? 'selected' : ''}>극동(fe)</option></select></div>
    ${field('s_refresh', 'Refresh Token', '', a.refreshToken ? '●●●●(설정됨, 변경시 입력)' : 'Atzr|...')}</div>
    <div style="margin-top:14px"><button class="btn-primary" onclick="saveAmazon()">저장</button></div>
  </div>
  <div class="card">
    <h3>브라우저 자동화 로그인</h3>
    <p class="muted">로컬 PC에서 실행할 때, 셀러센터에 1회 로그인하면 세션을 저장해 이후 자동 등록합니다. ${STATE.config.browserSession ? '<span class="pill ok">세션 저장됨</span>' : '<span class="pill warn">세션 없음</span>'}</p>
    <button class="btn-ghost" onclick="browserLogin()">브라우저 로그인 저장 실행</button>
  </div>
  <div class="card">
    <h3>자체 쇼핑몰 연동 ${STATE.config.ownmallLive ? '<span class="pill ok">연결됨</span>' : '<span class="pill warn">데모</span>'}</h3>
    <p class="muted">직접 운영하는 쇼핑몰에도 상품을 자동 등록합니다. 업로드·파이프라인·스케줄에서 "자체몰"을 선택하면 아래 API로 상품/재고/가격이 전송됩니다(품절 시 자동 품절 처리 포함).</p>
    <p class="muted">서버 <code>.env</code>에 설정하세요:</p>
    <pre style="background:var(--line);padding:10px;border-radius:8px;overflow:auto"><code>OWNMALL_API_URL=https://내쇼핑몰.com/api   # 필수
OWNMALL_API_KEY=발급키                      # 선택(Bearer/X-API-Key)
# 경로 커스터마이즈(선택, 기본값)
OWNMALL_UPSERT_PATH=/products
OWNMALL_STOCK_PATH=/products/stock
OWNMALL_PRICE_PATH=/products/price</code></pre>
    <p class="muted">자체몰이 받는 JSON: <code>POST {action:'upsert'|'stock'|'price'|'soldout', sku, product?, quantity?, price?}</code>. 2xx 응답이면 성공으로 처리합니다. 미설정 시 데모(mock)로 동작합니다.</p>
  </div>
  ${STATE.billing.isAdmin ? `<div class="card">
    <h3>최소마진 기준</h3>
    <p class="muted">파이프라인 업로드 전에 각 상품의 순마진(판매가 − 수수료 − 사입원가 − 입고배송 − 고객배송비 − 부대비)을 계산해, 기준 미달 상품은 자동으로 보류합니다. 배송비는 가격 규칙(마켓별)과 상품의 입고배송비에서 가져옵니다.</p>
    <div class="row" style="align-items:center;gap:8px">
      <span class="muted">최소마진</span><input id="minM" type="number" value="${STATE.config.minMarginPct}" style="width:80px"> <span class="muted">%</span>
      <button class="btn-ghost" onclick="saveMinMargin()">저장</button>
      <button class="btn-blue" onclick="loadMargin()">마진 리포트 보기</button>
    </div>
    <div id="marginReport" style="margin-top:12px"></div>
  </div>
  <div class="card">
    <h3>경쟁 최저가 언더컷 기준</h3>
    <p class="muted">파이프라인·스케줄에서 "경쟁 최저가 언더컷" 전략을 쓰면, 같은·비슷한 상품의 최저가보다 아래 %만큼 싸게 책정합니다(사입가 무관). 배송비는 별도로 두고, 그 가격으로 순마진이 최소마진 이상 나는 상품만 업로드합니다. 경쟁 제품이 없으면 원가의 2배로 책정합니다. 이 기준은 매일 경쟁가 자동 추적에도 적용돼, 올린 뒤에도 가격이 자동 유지됩니다.</p>
    <div class="row" style="align-items:center;gap:8px">
      <span class="muted">언더컷</span><input id="ucPct" type="number" value="${STATE.config.undercutPct}" style="width:70px"> <span class="muted">%</span>
      <span class="muted" style="margin-left:10px">최소마진(배송비 별도)</span><input id="ucMin" type="number" value="${STATE.config.undercutMinMarginPct}" style="width:70px"> <span class="muted">%</span>
      <button class="btn-ghost" onclick="saveUndercut()">저장</button>
    </div>
  </div>
  <div class="card">
    <h3>비교 확인(대기·검토) ${STATE.config.stageReview ? '<span class="pill ok">ON</span>' : '<span class="pill no">OFF</span>'}</h3>
    <p class="muted">ON이면 파이프라인·스케줄이 상품을 바로 올리지 않고 "대기·검토"에 모아, 경쟁최저가·책정가·마진을 비교한 뒤 승인해야 업로드됩니다. OFF면 통과 상품을 바로 업로드합니다. (개별 실행 시 체크박스로 그때그때 덮어쓸 수 있습니다.)</p>
    <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="stageSw" ${STATE.config.stageReview ? 'checked' : ''} onchange="saveStageReview(this.checked)" style="width:auto"> 비교 확인 사용(기본값으로 대기 상태에 모으기)</label>
  </div>` : ''}
  <div class="card">
    <h3>경쟁가 검색 연동</h3>
    <p class="muted">언더컷 가격결정이 쓰는 경쟁 최저가 검색 소스입니다. 미연동 마켓은 데모(mock) 가격으로 동작합니다.</p>
    <p>네이버쇼핑(국내): ${STATE.config.naverSearchLive ? '<span class="pill ok">실검색</span>' : '<span class="pill warn">데모</span>'} · eBay: ${STATE.config.ebayLive ? '<span class="pill ok">실검색</span>' : '<span class="pill warn">데모</span>'} · 아마존: ${STATE.config.amazonSearchLive ? '<span class="pill ok">실검색</span>' : '<span class="pill warn">데모</span>'}</p>
    <p class="muted">아마존 실검색은 SP-API(카탈로그+가격, <code>AMAZON_PROVIDER=spapi</code> + SPAPI_* 자격증명) 또는 Keepa(<code>KEEPA_API_KEY</code>)로 켜집니다. 네이버쇼핑은 <code>NAVER_CLIENT_ID/SECRET</code>, eBay는 <code>EBAY_OAUTH_TOKEN</code>.</p>
  </div>
  <div class="card">
    <h3>현재 서버 모드</h3>
    <p>아마존 기본 방식: <code>${STATE.config.amazonProvider}</code> · AI: <code>${STATE.config.aiProvider}</code> · 자체몰: <code>${STATE.config.ownmallLive ? 'live' : 'mock'}</code></p>
    <p class="muted">기본 방식과 API 키는 서버의 .env 파일로 바꿉니다. 미설정 시 플랫파일 + 내장 AI로 동작합니다.</p>
  </div>`;
}
async function saveMinMargin() {
  try { await api('/api/settings/minmargin', { method: 'POST', body: { minMarginPct: $('#minM').value } }); toast('최소마진 저장', 'ok'); const s = await api('/api/state'); STATE = s.state; }
  catch (e) { onErr(e); }
}
async function saveUndercut() {
  try { await api('/api/settings/undercut', { method: 'POST', body: { undercutPct: $('#ucPct').value, undercutMinMarginPct: $('#ucMin').value } }); toast('언더컷 기준 저장', 'ok'); const s = await api('/api/state'); STATE = s.state; }
  catch (e) { onErr(e); }
}
async function saveStageReview(on) {
  try { await api('/api/settings/stage-review', { method: 'POST', body: { on } }); toast(on ? '비교 확인 ON' : '비교 확인 OFF', 'ok'); const s = await api('/api/state'); STATE = s.state; render(); }
  catch (e) { onErr(e); }
}
async function loadMargin() {
  const box = $('#marginReport'); box.innerHTML = '<p class="muted">계산 중…</p>';
  try {
    const d = await api('/api/margin/report');
    const rows = d.rows.filter(r => !r.noData);
    box.innerHTML = `<p class="muted">기준 ${d.minMarginPct}% · 전체 ${d.total}개 · 미달 <b class="result-no">${d.belowCount}</b>개</p>
      ${rows.length ? `<table><tr><th>SKU</th><th>상품</th><th>사입원가</th><th>입고배송</th><th>원가합</th><th>최저마진</th><th>상태</th></tr>
      ${rows.slice(0, 50).map(r => `<tr><td>${esc(r.sku)}</td><td>${esc((r.title || '').slice(0, 26))}</td><td>${r.cost ? r.cost.toLocaleString() : '-'}</td><td>${r.shipCost ? r.shipCost.toLocaleString() : '-'}</td><td>${r.landed ? r.landed.toLocaleString() + '원' : '-'}</td><td class="${r.belowMin ? 'result-no' : 'result-ok'}">${r.worstMarginPct == null ? '-' : r.worstMarginPct + '%'}</td><td>${r.belowMin ? '<span class="pill no">미달</span>' : '<span class="pill ok">통과</span>'}</td></tr>`).join('')}</table>
      ${d.belowCount ? `<div style="margin-top:10px"><button class="btn-primary" onclick="applyMargin()">미달 ${d.belowCount}개 보류 처리</button></div>` : ''}`
      : '<p class="muted">원가·판매가가 설정된 상품이 없습니다. 상품에 원가(cost)를 입력하면 마진이 계산됩니다.</p>'}`;
  } catch (e) { box.innerHTML = ''; onErr(e); }
}
async function applyMargin() {
  try { const d = await api('/api/margin/apply', { method: 'POST', body: {} }); toast(`${d.belowCount}개 보류 처리`, 'ok'); STATE = d.state; loadMargin(); }
  catch (e) { onErr(e); }
}
async function saveAmazon() {
  const body = { sellerId: $('#s_sellerId').value, marketplaceId: $('#s_market').value, region: $('#s_region').value };
  const rt = $('#s_refresh').value.trim(); if (rt) body.refreshToken = rt;
  try { await api('/api/amazon/settings', { method: 'POST', body }); toast('저장되었습니다', 'ok'); render(); }
  catch (e) { onErr(e); }
}
async function browserLogin() {
  toast('브라우저를 엽니다. 로그인을 완료하세요...', '');
  try { const d = await api('/api/amazon/browser-login', { method: 'POST', body: {} }); toast('세션 저장 완료', 'ok'); }
  catch (e) { onErr(e); }
}

function viewSellers() {
  const s = STATE.sellers || [];
  return `
  <h1>셀러 관리 (B2B)</h1>
  <p class="sub">가입한 셀러와 각자의 아마존 연결·상품 수를 봅니다.</p>
  ${adminRevenueCard()}
  <div class="grid3">
    <div class="stat"><div class="n">${s.length}</div><div class="l">가입 셀러</div></div>
    <div class="stat"><div class="n result-ok">${s.filter(x => x.amazonConnected).length}</div><div class="l">아마존 연결됨</div></div>
    <div class="stat"><div class="n">${s.reduce((a, x) => a + x.products, 0)}</div><div class="l">전체 셀러 상품</div></div>
  </div>
  <div class="card">
    ${s.length ? `<table><tr><th>이름</th><th>이메일</th><th>요금제</th><th>상품</th><th>아마존</th></tr>
    ${s.map(x => `<tr><td>${esc(x.name)}</td><td>${esc(x.email)}</td><td>${esc(x.plan)}</td><td>${x.products}</td><td>${x.amazonConnected ? '<span class="pill ok">연결</span>' : '<span class="pill no">미연결</span>'}</td></tr>`).join('')}</table>`
      : '<p class="muted">가입한 셀러가 없습니다. 로그인 화면의 "회원가입"으로 셀러가 직접 가입합니다.</p>'}
  </div>`;
}

async function delProduct(id) {
  if (!confirm('이 상품을 삭제할까요?')) return;
  try { await api('/api/products/' + id, { method: 'DELETE' }); toast('삭제되었습니다', 'ok'); render(); }
  catch (e) { onErr(e); }
}

// ===== PWA 서비스워커 등록 =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

// ===== 부팅 =====
(async function init() {
  if (TOKENS.access) {
    try { const d = await api('/api/state'); STATE = d.state; enterApp(); return; }
    catch (_) { setTokens(null, null); }
  }
})();
