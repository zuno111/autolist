'use strict';
// AutoList - 아마존 상품 등록 자동 대행 플랫폼 (STUDIO ig)
// 단일 서버: Express + 정적 UI + API. 데모 즉시 동작, env로 실연동 전환.
try { require('fs').existsSync('.env') && loadEnv('.env'); } catch (_) {}
function loadEnv(f) {
  const txt = require('fs').readFileSync(f, 'utf8');
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const express = require('express');
const http = require('http');
const path = require('path');
const multer = require('multer');

const { makeStore } = require('./src/store');
const { seed } = require('./src/seed');
const auth = require('./src/auth');
const sec = require('./src/security');
const logic = require('./src/logic');
const ai = require('./src/ai');
const importer = require('./src/importer');
const commerce = require('./src/commerce');
const browser = require('./src/amazon-browser');
const billing = require('./src/billing');
const push = require('./src/push');

const PORT = process.env.PORT || 8787;
const store = makeStore(seed);
let db;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

async function boot() {
  db = await store.load();
  // 시드 비밀번호 해시화 (pwPlain → pwHash)
  let changed = false;
  for (const u of db.users) {
    if (u.pwPlain && !u.pwHash) { u.pwHash = await auth.hashPw(u.pwPlain); delete u.pwPlain; changed = true; }
  }
  if (changed) { db.rev = (db.rev || 1) + 1; await store.save(db); }

  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '15mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
  app.use(sec.clientIp);
  app.use(sec.securityHeaders);
  app.use(sec.cors());
  app.use(sec.rateLimiter());

  // 정적 UI
  app.use(express.static(path.join(__dirname, 'public')));
  // 생성 이미지(쓰기 가능 데이터 폴더) — 실행파일 배포 시 스냅샷 밖에서 서빙
  app.use('/media', express.static(path.join(require('./src/paths').dataDir(), 'media')));

  // 인증 게이트
  app.use(auth.authMiddleware(db));

  // ---- 공통 mut 래퍼 ----
  function mut(action, fn) {
    return async (req, res) => {
      try {
        const r = (await fn(req.me, req)) || {};
        db.rev = (db.rev || 1) + 1;
        await store.save(db);
        const { affected, ...rest } = r;
        res.json({ ok: true, ...rest, state: logic.stateFor(db, req.me) });
      } catch (e) {
        res.status(e.code && e.code < 600 ? e.code : 500).json({ error: e.message, ...(e.extra || {}) });
      }
    };
  }

  // ================= 인증 =================
  app.get('/api/health', (req, res) => res.json({ ok: true, name: 'AutoList', rev: db.rev }));

  app.post('/api/auth/register', async (req, res) => {
    try {
      const email = sec.V.email(req.body.email);
      const pw = sec.V.str(req.body.password, { name: '비밀번호', min: 6, max: 100 });
      const name = sec.V.str(req.body.name || email.split('@')[0], { name: '이름', max: 60 });
      if (db.users.find(u => u.email === email)) throw sec.httpErr(409, '이미 가입된 이메일입니다');
      const user = { id: logic.uid('u'), email, name, role: 'seller', plan: 'free',
        pwHash: await auth.hashPw(pw), amazon: {}, refreshTokens: [], createdAt: Date.now() };
      db.users.push(user);
      // 가입 시 요금제 선택: 유료면 14일 무료 체험 시작(카드 없이)
      const chosen = req.body.plan;
      if (chosen === 'pro' || chosen === 'business') { try { billing.startTrial(db, user, chosen); } catch (_) {} }
      db.rev = (db.rev || 1) + 1; await store.save(db);
      issueTokens(res, user);
    } catch (e) { res.status(e.code || 500).json({ error: e.message }); }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const email = sec.V.email(req.body.email);
      sec.checkLockout(email);
      const user = db.users.find(u => u.email === email);
      const okPw = user && await auth.checkPw(req.body.password || '', user.pwHash);
      if (!okPw) { sec.recordFail(email); throw sec.httpErr(401, '이메일 또는 비밀번호가 올바르지 않습니다'); }
      sec.clearFail(email);
      issueTokens(res, user);
    } catch (e) { res.status(e.code || 500).json({ error: e.message }); }
  });

  app.post('/api/auth/refresh', async (req, res) => {
    try {
      const rt = req.body.refreshToken;
      const user = db.users.find(u => (u.refreshTokens || []).includes(rt));
      if (!user) throw sec.httpErr(401, '세션이 만료되었습니다');
      user.refreshTokens = user.refreshTokens.filter(t => t !== rt); // 회전
      db.rev = (db.rev || 1) + 1; await store.save(db);
      issueTokens(res, user);
    } catch (e) { res.status(e.code || 500).json({ error: e.message }); }
  });

  function issueTokens(res, user) {
    const access = auth.signAccess({ uid: user.id, role: user.role });
    const refresh = auth.newRefresh();
    user.refreshTokens = [...(user.refreshTokens || []).slice(-4), refresh];
    store.save(db);
    res.json({ ok: true, access, refresh, me: logic.stateFor(db, user).me, state: logic.stateFor(db, user) });
  }

  // ================= 상태 =================
  app.get('/api/state', (req, res) => res.json({ ok: true, state: logic.stateFor(db, req.me) }));

  // ================= 상품 =================
  app.post('/api/products', mut('product.save', (me, req) => logic.saveProduct(db, me, req.body)));
  app.post('/api/products/bulk', mut('product.bulk', (me, req) => logic.saveProductsBulk(db, me, req.body.items || [])));
  app.delete('/api/products/:id', mut('product.delete', (me, req) => logic.deleteProduct(db, me, req.params.id)));

  // 엑셀/CSV 업로드 → 상품 파싱
  app.post('/api/products/import-file', upload.single('file'), async (req, res) => {
    try {
      if (!req.file) throw sec.httpErr(400, '파일이 없습니다');
      const XLSX = require('xlsx');
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const items = rows.map(r => mapImportedRow(r));
      const r = logic.saveProductsBulk(db, req.me, items);
      db.rev = (db.rev || 1) + 1; await store.save(db);
      res.json({ ok: true, count: r.count, state: logic.stateFor(db, req.me) });
    } catch (e) { res.status(e.code || 500).json({ error: e.message }); }
  });

  // 쇼핑몰 전체/카테고리 대량 가져오기
  app.post('/api/products/import-mall', async (req, res) => {
    try {
      const r = await logic.mallImport(db, req.me, req.body || {});
      db.rev = (db.rev || 1) + 1; await store.save(db);
      res.json({ ok: true, ...r, state: logic.stateFor(db, req.me) });
    } catch (e) { res.status(e.code || 500).json({ error: e.message }); }
  });

  // 쇼핑몰 URL 가져오기(단건)
  app.post('/api/products/import-url', async (req, res) => {
    try {
      const url = sec.V.str(req.body.url, { name: 'URL', min: 8, max: 2000 });
      const r = await importer.importFromUrl(url);
      res.json(r);
    } catch (e) { res.status(e.code || 500).json({ error: e.message }); }
  });

  // AI 리라이트(선택/미작성 전체)
  app.post('/api/products/rewrite', mut('product.rewrite', (me, req) => logic.rewriteProducts(db, me, req.body || {})));
  // 이미지 규격화·배경처리
  app.post('/api/products/process-images', mut('product.images', (me, req) => logic.processImages(db, me, req.body || {})));
  // 원클릭 파이프라인
  app.post('/api/pipeline/run', async (req, res) => {
    try { const r = await logic.autopilot(db, req.me, req.body || {}); db.rev = (db.rev || 1) + 1; await store.save(db); res.json({ ok: true, ...r, state: logic.stateFor(db, req.me) }); }
    catch (e) { res.status(e.code || 500).json({ error: e.message }); }
  });
  // 자동 스케줄
  app.get('/api/pipeline/schedules', (req, res) => res.json({ ok: true, schedules: logic.listSchedules(db, req.me) }));
  app.post('/api/pipeline/schedules', mut('sched.add', (me, req) => logic.addSchedule(db, me, req.body || {})));
  app.post('/api/pipeline/schedules/toggle', mut('sched.toggle', (me, req) => logic.toggleSchedule(db, me, req.body.id, req.body.enabled)));
  app.delete('/api/pipeline/schedules/:id', mut('sched.del', (me, req) => logic.deleteSchedule(db, me, req.params.id)));
  app.post('/api/pipeline/schedules/run-now', async (req, res) => {
    try { const r = await logic.runScheduleNow(db, req.me, req.body.id); db.rev = (db.rev || 1) + 1; await store.save(db); res.json({ ok: true, ...r, schedules: logic.listSchedules(db, req.me) }); }
    catch (e) { res.status(e.code || 500).json({ error: e.message }); }
  });

  // AI 상품정보 자동생성 (월 한도 적용, admin 면제)
  app.post('/api/ai/generate', async (req, res) => {
    try {
      billing.enforce(db, req.me, 'ai', 1);
      const out = await ai.generateListing(req.body || {});
      db.aiUsage.push({ owner: req.me.id, at: Date.now() });
      db.aiUsage = db.aiUsage.slice(-5000);
      db.rev = (db.rev || 1) + 1; await store.save(db);
      res.json({ ok: true, ...out });
    } catch (e) { res.status(e.code && e.code < 600 ? e.code : 500).json({ error: e.message, ...(e.extra || {}) }); }
  });

  // ================= 파일 생성/다운로드 =================
  app.post('/api/export/:market', mut('export', (me, req) => logic.exportFile(db, me, req.params.market)));

  // 실제 파일 다운로드 (즉석 생성)
  app.get('/api/download/:market', (req, res) => {
    try {
      const market = req.params.market;
      const products = logic.visibleProducts(db, req.me);
      const result = commerce.exportMarket(products, market);
      const buf = Buffer.from(result.content, 'utf8');
      res.setHeader('Content-Type', result.mime + '; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`);
      res.send(buf);
    } catch (e) { res.status(e.code || 500).json({ error: e.message }); }
  });

  // ================= 업로드 =================
  app.post('/api/amazon/upload', mut('amazon.upload', (me, req) => logic.uploadToAmazon(db, me, req.body || {})));
  app.post('/api/market/upload', mut('market.upload', (me, req) => logic.uploadToMarket(db, me, req.body || {})));

  // ================= 재고 자동 동기화 =================
  app.post('/api/inventory/update', mut('inventory.update', (me, req) => logic.updateStock(db, me, req.body || {})));
  app.post('/api/inventory/sync-all', mut('inventory.syncAll', (me) => logic.syncAllInventory(db, me)));
  // 소스몰 품절 자동 동기화
  app.post('/api/inventory/sync-source', async (req, res) => {
    try { const r = await logic.syncSourceStock(db, req.me, req.body || {}); db.rev = (db.rev || 1) + 1; await store.save(db); res.json({ ok: true, ...r, state: logic.stateFor(db, req.me) }); }
    catch (e) { res.status(e.code || 500).json({ error: e.message }); }
  });
  app.post('/api/amazon/settings', mut('amazon.settings', (me, req) => logic.saveAmazonSettings(db, me, req.body || {})));

  // 브라우저 자동화 로그인 세션 저장 (로컬 실행 시)
  app.post('/api/amazon/browser-login', async (req, res) => {
    try {
      const r = await browser.saveSession();
      res.json({ ok: true, ...r });
    } catch (e) { res.status(e.code || 500).json({ error: e.message }); }
  });

  // ================= 판매 현황 =================
  app.post('/api/amazon/orders/sync', async (req, res) => {
    try {
      const days = Math.min(90, Math.max(1, Number(req.body.days) || 30));
      const r = await logic.syncOrders(db, req.me, days);
      db.rev = (db.rev || 1) + 1; await store.save(db);
      res.json({ ok: true, ...r, sales: logic.salesSummary(db, req.me, days), state: logic.stateFor(db, req.me) });
    } catch (e) { res.status(e.code || 500).json({ error: e.message }); }
  });
  app.get('/api/sales', (req, res) => {
    const days = Math.min(90, Math.max(1, Number(req.query.days) || 30));
    res.json({ ok: true, sales: logic.salesSummary(db, req.me, days, req.query.market || 'all') });
  });

  // ================= 배송 처리 =================
  app.get('/api/orders', (req, res) => res.json({ ok: true, orders: logic.listOrders(db, req.me, { status: req.query.status }) }));
  app.post('/api/orders/ship', mut('order.ship', (me, req) => logic.shipOrder(db, me, req.body || {})));

  // ================= 가격 자동조정 =================
  app.get('/api/pricing/preview', async (req, res) => {
    try { res.json({ ok: true, ...(await logic.pricingPreview(db, req.me)) }); }
    catch (e) { res.status(e.code || 500).json({ error: e.message }); }
  });
  app.post('/api/pricing/apply', mut('pricing.apply', (me, req) => logic.pricingApply(db, me, req.body || {})));
  app.post('/api/pricing/rule', mut('pricing.rule', (me, req) => logic.savePricingRule(db, me, req.body.market, req.body.rule || {})));
  // 마진 리포트·최소마진 설정
  app.get('/api/margin/report', async (req, res) => {
    try { res.json({ ok: true, ...(await logic.marginReport(db, req.me, { minMarginPct: req.query.min != null ? Number(req.query.min) : undefined })) }); }
    catch (e) { res.status(e.code || 500).json({ error: e.message }); }
  });
  app.post('/api/margin/apply', async (req, res) => {
    try { const r = await logic.marginReport(db, req.me, { minMarginPct: req.body.minMarginPct, apply: true }); db.rev = (db.rev || 1) + 1; await store.save(db); res.json({ ok: true, ...r, state: logic.stateFor(db, req.me) }); }
    catch (e) { res.status(e.code || 500).json({ error: e.message }); }
  });
  app.post('/api/settings/minmargin', mut('settings.minmargin', (me, req) => logic.saveMinMargin(db, me, req.body.minMarginPct)));
  app.post('/api/settings/undercut', mut('settings.undercut', (me, req) => logic.saveUndercut(db, me, req.body || {})));
  app.post('/api/settings/stage-review', mut('settings.stageReview', (me, req) => logic.saveStageReview(db, me, req.body.on)));
  // 대기(검토) 목록 + 승인/거절
  app.get('/api/pending', (req, res) => res.json({ ok: true, ...logic.listPending(db, req.me) }));
  app.post('/api/pending/approve', async (req, res) => {
    try { const r = await logic.approvePending(db, req.me, req.body || {}); db.rev = (db.rev || 1) + 1; await store.save(db); res.json({ ok: true, ...r, state: logic.stateFor(db, req.me) }); }
    catch (e) { res.status(e.code || 500).json({ error: e.message }); }
  });
  app.post('/api/pending/reject', mut('pending.reject', (me, req) => logic.rejectPending(db, me, req.body || {})));
  // 경쟁 최저가 언더컷 가격결정 — 미리보기(apply=false) / 적용(apply=true)
  app.post('/api/competitive/price', async (req, res) => {
    try { const r = await logic.competitivePrice(db, req.me, { ids: req.body.ids, market: req.body.market, undercutPct: req.body.undercutPct, minMarginPct: req.body.minMarginPct, apply: req.body.apply !== false, stage: !!req.body.stage });
      if (req.body.apply !== false) { db.rev = (db.rev || 1) + 1; await store.save(db); }
      res.json({ ok: true, ...r, state: logic.stateFor(db, req.me) }); }
    catch (e) { res.status(e.code || 500).json({ error: e.message }); }
  });

  // ================= 웹 푸시 =================
  app.get('/api/push/key', (req, res) => res.json({ ok: true, publicKey: push.publicKey(), enabled: push.enabled() }));
  app.post('/api/push/subscribe', mut('push.subscribe', (me, req) => logic.pushSubscribe(db, me, req.body.subscription)));
  app.post('/api/push/test', async (req, res) => {
    try { const r = await logic.pushTest(db, req.me); db.rev = (db.rev || 1) + 1; await store.save(db); res.json({ ok: true, ...r }); }
    catch (e) { res.status(e.code || 500).json({ error: e.message }); }
  });

  // ================= 통합 대시보드·알림·내보내기 =================
  app.get('/api/dashboard', async (req, res) => {
    try { res.json({ ok: true, summary: await logic.dashboardSummary(db, req.me) }); }
    catch (e) { res.status(e.code || 500).json({ error: e.message }); }
  });
  app.get('/api/alerts', (req, res) => res.json({ ok: true, ...logic.allAlerts(db, req.me) }));
  app.post('/api/alerts/read', mut('alerts.read', (me) => logic.markAlertsRead(db, me)));
  app.post('/api/alerts/clear', mut('alerts.clear', (me) => logic.clearAlerts(db, me)));
  app.post('/api/settings/lowstock', mut('settings.lowstock', (me, req) => logic.saveLowStock(db, me, req.body.threshold)));
  app.post('/api/products/bulk-delete', mut('product.bulkDelete', (me, req) => logic.bulkDelete(db, me, req.body.ids || [])));

  function sendCsv(res, r) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(r.filename)}`);
    res.send(Buffer.from(r.content, 'utf8'));
  }
  app.get('/api/export/sales.csv', (req, res) => sendCsv(res, logic.salesCsv(db, req.me, Math.min(365, Number(req.query.days) || 30))));
  app.get('/api/export/profit.csv', async (req, res) => { try { sendCsv(res, await logic.profitCsv(db, req.me, Math.min(365, Number(req.query.days) || 30))); } catch (e) { res.status(500).json({ error: e.message }); } });
  app.get('/api/export/reviews.csv', (req, res) => sendCsv(res, logic.reviewsCsv(db, req.me)));

  // ================= 리뷰 모니터링·자동응대 =================
  app.post('/api/reviews/sync', async (req, res) => {
    try {
      const r = await logic.syncReviews(db, req.me, Math.min(365, Number(req.body.days) || 90));
      db.rev = (db.rev || 1) + 1; await store.save(db);
      res.json({ ok: true, ...r, ...logic.reviewList(db, req.me, {}) });
    } catch (e) { res.status(e.code || 500).json({ error: e.message }); }
  });
  app.get('/api/reviews', (req, res) => res.json({ ok: true, ...logic.reviewList(db, req.me, { filter: req.query.filter, market: req.query.market }) }));
  app.post('/api/reviews/draft', async (req, res) => {
    try { res.json({ ok: true, ...(await logic.draftReviewReply(db, req.me, req.body.reviewId)) }); }
    catch (e) { res.status(e.code || 500).json({ error: e.message }); }
  });
  app.post('/api/reviews/reply', mut('review.reply', (me, req) => logic.postReviewReply(db, me, req.body.reviewId, req.body.text)));

  // ================= 가격 추적·순이익 =================
  app.post('/api/competitors/track', mut('track.run', (me) => logic.trackCompetitors(db, me)));
  app.get('/api/competitors/watch', (req, res) => res.json({ ok: true, ...logic.watchState(db, req.me) }));
  app.get('/api/profit', async (req, res) => {
    try {
      const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
      res.json({ ok: true, report: await logic.profitReport(db, req.me, days, req.query.market || 'all') });
    } catch (e) { res.status(e.code || 500).json({ error: e.message }); }
  });
  app.post('/api/settings/shipping', mut('settings.shipping', (me, req) => logic.saveShipping(db, me, req.body.shippingCostKRW)));

  // ================= AI 소싱 발굴 =================
  app.post('/api/sourcing/discover', async (req, res) => {
    try { res.json({ ok: true, ...(await logic.sourcingDiscover(db, req.me, req.body || {})) }); }
    catch (e) { res.status(e.code || 500).json({ error: e.message }); }
  });
  app.post('/api/sourcing/add', mut('sourcing.add', (me, req) => logic.sourcingAdd(db, me, req.body.candidate || {})));

  // ================= 경쟁 분석 =================
  app.get('/api/competitors/rank', async (req, res) => {
    try { res.json({ ok: true, ...(await logic.competitivenessRank(db, req.me, req.query.market)) }); }
    catch (e) { res.status(e.code || 500).json({ error: e.message }); }
  });
  app.get('/api/competitors/compare', async (req, res) => {
    try { res.json({ ok: true, ...(await logic.compareProduct(db, req.me, { id: req.query.id, market: req.query.market })) }); }
    catch (e) { res.status(e.code || 500).json({ error: e.message }); }
  });

  // ================= 구독·결제 =================
  app.get('/api/billing/plans', (req, res) => res.json({ ok: true, plans: billing.PLANS, mock: billing.isMock() }));

  app.post('/api/billing/checkout', async (req, res) => {
    try {
      const origin = (req.headers.origin) || ('http://localhost:' + PORT);
      const out = await billing.checkout(db, req.me, req.body.plan, origin);
      res.json({ ok: true, ...out });
    } catch (e) { res.status(e.code || 500).json({ error: e.message }); }
  });

  // 목업 전용: 결제 없이 구독 활성화(데모/체험)
  app.post('/api/billing/dev-activate', mut('billing.activate', (me, req) => {
    if (!billing.isMock()) throw sec.httpErr(403, '실결제 모드에서는 사용할 수 없습니다');
    if (billing.isAdmin(me)) throw sec.httpErr(400, '관리자 계정은 이미 무료·무제한입니다');
    const plan = req.body.plan;
    if (!['pro', 'business'].includes(plan)) throw sec.httpErr(400, '유효하지 않은 요금제');
    billing.setSubscription(db, me.id, plan, 'active', { mock: true });
    return { affected: ['subscriptions'], plan };
  }));

  // 무료 체험 시작 (로그인 후)
  app.post('/api/billing/start-trial', mut('billing.trial', (me, req) => {
    const plan = req.body.plan;
    billing.startTrial(db, me, plan);
    return { affected: ['subscriptions'], plan };
  }));

  app.post('/api/billing/cancel', mut('billing.cancel', (me) => {
    const sub = (db.subscriptions || {})[me.id];
    if (sub) { sub.status = 'canceled'; sub.updatedAt = Date.now(); }
    return { affected: ['subscriptions'] };
  }));

  // Stripe 웹훅 (실결제 모드) — 서명검증 포함
  app.post('/api/billing/webhook', async (req, res) => {
    try {
      const evt = billing.constructEvent(req.rawBody, req.headers['stripe-signature']);
      const type = evt.type;
      const obj = (evt.data && evt.data.object) || {};
      const meta = obj.metadata || {};
      if (type === 'checkout.session.completed') {
        billing.setSubscription(db, meta.scopeId, meta.plan, 'active', { subscription_id: obj.subscription, customer_id: obj.customer });
      } else if (type === 'customer.subscription.created' || type === 'customer.subscription.updated') {
        const status = obj.status === 'trialing' ? 'trialing' : (obj.status === 'active' ? 'active' : obj.status === 'past_due' ? 'past_due' : 'canceled');
        const extra = { subscription_id: obj.id, customer_id: obj.customer };
        if (obj.trial_end) extra.trialEndsAt = obj.trial_end * 1000;
        billing.setSubscription(db, meta.scopeId, meta.plan, status, extra);
      } else if (type === 'customer.subscription.deleted') {
        const s = Object.values(db.subscriptions || {}).find(x => x.subscription_id === obj.id); if (s) s.status = 'canceled';
      } else if (type === 'invoice.payment_failed') {
        const s = Object.values(db.subscriptions || {}).find(x => x.subscription_id === obj.subscription); if (s) s.status = 'past_due';
      } else if (type === 'invoice.paid' || type === 'invoice.payment_succeeded') {
        const s = Object.values(db.subscriptions || {}).find(x => x.subscription_id === obj.subscription); if (s) s.status = 'active';
      }
      db.rev = (db.rev || 1) + 1; await store.save(db);
      res.json({ received: true });
    } catch (e) { res.status(e.code || 400).json({ error: e.message }); }
  });

  // ================= 관리자(B2B) =================
  app.get('/api/admin/sellers', auth.adminOnly, (req, res) => res.json({ ok: true, sellers: logic.listSellers(db) }));
  app.get('/api/admin/stats', auth.adminOnly, (req, res) => res.json({ ok: true, stats: billing.adminStats(db) }));

  // SPA 폴백
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'not found' });
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  const server = http.createServer(app);
  server.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`\n  AutoList 실행 중  →  ${url}`);
    console.log(`  최초 로그인: admin@autolist.local / admin1234`);
    console.log(`  아마존 연동 모드: ${process.env.AMAZON_PROVIDER || 'file(플랫파일)'}  |  AI: ${ai.provider() === 'mock' ? 'builtin(무료)' : ai.provider()}\n`);
    // 로컬 실행이면 브라우저 자동 열기(배포/CI 제외)
    if (process.env.NODE_ENV !== 'production' && process.env.AUTO_OPEN !== '0' && !process.env.CI) {
      const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open';
      try { require('child_process').exec(`${cmd} ${url}`); } catch (_) {}
    }
  });

  // 일일 경쟁가 자동 추적·리프라이스 스윕 (24시간 주기)
  const DAY = 24 * 60 * 60 * 1000;
  async function dailySweep() {
    try {
      for (const u of db.users) { try { await logic.trackCompetitors(db, u); } catch (_) {} try { await logic.syncReviews(db, u); } catch (_) {} try { await logic.syncSourceStock(db, u, {}); } catch (_) {} }
      try { const n = await logic.runDueSchedules(db); if (n) console.log('[스케줄] 자동 파이프라인', n, '건 실행'); } catch (_) {}
      db.rev = (db.rev || 1) + 1; await store.save(db);
      console.log('[추적] 일일 경쟁가 스윕 완료', new Date().toISOString());
    } catch (e) { console.error('[추적] 스윕 오류', e.message); }
  }
  if (process.env.AUTO_TRACK !== 'off') setInterval(dailySweep, DAY);
}

function mapImportedRow(r) {
  const g = (...keys) => { for (const k of keys) { if (r[k] != null && r[k] !== '') return r[k]; } return ''; };
  return {
    sku: g('sku', 'SKU', '상품코드', '판매자상품코드') || 'IMP-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
    title: g('title', '상품명', '제목'),
    title_en: g('title_en', '영문제목', 'item-name'),
    brand: g('brand', '브랜드', 'brand-name'),
    category: g('category', '카테고리'),
    price: Number(g('price', '판매가', '가격') || 0),
    price_usd: Number(g('price_usd', 'USD', 'standard-price') || 0),
    stock: Number(g('stock', '재고', '재고수량', 'quantity') || 0),
    images: String(g('images', '이미지', '대표이미지', 'main-image-url')).split(/[,|]/).map(s => s.trim()).filter(Boolean),
    description: g('description', '상품설명', '설명'),
    description_en: g('description_en', '영문설명'),
    bullets_en: String(g('bullets_en', '불렛', 'bullet-point1')).split('\n').map(s => s.trim()).filter(Boolean),
    keywords: g('keywords', '키워드', 'generic-keywords'),
    origin: g('origin', '원산지', 'country-of-origin'),
    markets: ['amazon'],
  };
}

boot().catch(e => { console.error('기동 실패:', e); process.exit(1); });
