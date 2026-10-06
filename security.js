'use strict';
// 무의존성 보안 미들웨어: 헤더, 레이트리밋, 로그인 잠금, CORS, 검증기.

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:");
  next();
}

function cors() {
  const list = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (list.length === 0 || list.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  };
}

function rateLimiter({ windowMs = 60000, max = 240, authMax = 20 } = {}) {
  const buckets = new Map();
  return (req, res, next) => {
    const isAuth = req.path.startsWith('/api/auth');
    const limit = isAuth ? authMax : max;
    const key = (req.ip4 || req.ip) + '|' + (isAuth ? 'auth' : 'gen');
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || now > b.reset) { b = { count: 0, reset: now + windowMs }; buckets.set(key, b); }
    b.count++;
    if (b.count > limit) return res.status(429).json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.' });
    next();
  };
}

const lockouts = new Map();
function checkLockout(account) {
  const l = lockouts.get(account);
  if (l && Date.now() < l.until) {
    const sec = Math.ceil((l.until - Date.now()) / 1000);
    const e = new Error(`로그인 시도가 많아 ${sec}초 동안 잠겼습니다.`);
    e.code = 429; throw e;
  }
}
function recordFail(account) {
  const l = lockouts.get(account) || { fails: 0, until: 0 };
  l.fails++;
  if (l.fails >= 5) { l.until = Date.now() + Math.min(2 ** (l.fails - 5) * 1000 * 30, 15 * 60 * 1000); }
  lockouts.set(account, l);
}
function clearFail(account) { lockouts.delete(account); }

const V = {
  str(v, { min = 0, max = 100000, name = '값' } = {}) {
    if (typeof v !== 'string') throw httpErr(400, `${name}: 문자열이어야 합니다`);
    if (v.length < min) throw httpErr(400, `${name}: ${min}자 이상 입력하세요`);
    if (v.length > max) throw httpErr(400, `${name}: ${max}자 이하로 입력하세요`);
    return v;
  },
  num(v, { name = '값', min = -Infinity, max = Infinity } = {}) {
    const n = Number(v);
    if (!isFinite(n)) throw httpErr(400, `${name}: 숫자여야 합니다`);
    if (n < min || n > max) throw httpErr(400, `${name}: 범위를 벗어났습니다`);
    return n;
  },
  oneOf(v, arr, name = '값') {
    if (!arr.includes(v)) throw httpErr(400, `${name}: 허용되지 않는 값`);
    return v;
  },
  email(v) {
    V.str(v, { name: '이메일', min: 3, max: 200 });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) throw httpErr(400, '이메일 형식이 올바르지 않습니다');
    return v.toLowerCase();
  },
};
function httpErr(code, message) { const e = new Error(message); e.code = code; return e; }

function clientIp(req, _res, next) {
  const xf = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  req.ip4 = xf || req.socket.remoteAddress || req.ip;
  next();
}

module.exports = { securityHeaders, cors, rateLimiter, checkLockout, recordFail, clearFail, V, httpErr, clientIp };
