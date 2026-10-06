'use strict';
// AI 소싱 발굴 — 카테고리·키워드·예산으로 팔릴 만한 후보 상품을 찾아 점수화.
// 후보 생성(규칙+AI), 경쟁 검색으로 시장가·경쟁 파악, 수요·마진·경쟁 가중 점수.
const competitor = require('./competitor-search');
const pricing = require('./pricing');
const fx = require('./fx');

// 카테고리별 후보 아이디어(규칙 기반 기본). 키워드가 있으면 변형으로 확장.
const CATALOG_IDEAS = {
  kitchen: ['Insulated Tumbler', 'Silicone Baking Mat', 'Knife Sharpener', 'Collapsible Food Container', 'Coffee Dripper Set', 'Vegetable Chopper', 'Reusable Food Wrap', 'Spice Jar Set'],
  electronics: ['Wireless Earbuds', 'Phone Tripod Stand', 'USB-C Hub', 'Cable Organizer Box', 'Bluetooth Speaker', 'Laptop Stand', 'Fast Charger 65W', 'Webcam Cover'],
  beauty: ['Jade Roller Set', 'Silicone Face Brush', 'Makeup Organizer', 'LED Vanity Mirror', 'Nail Care Kit', 'Hair Scalp Massager', 'Reusable Cotton Pads'],
  home: ['Storage Basket Set', 'Door Draft Stopper', 'LED Motion Light', 'Shoe Rack Organizer', 'Laundry Sorter', 'Cable Clips', 'Drawer Dividers'],
  fitness: ['Resistance Band Set', 'Yoga Mat', 'Massage Gun', 'Jump Rope', 'Foam Roller', 'Grip Strengthener', 'Water Bottle 1L'],
  pet: ['Slow Feeder Bowl', 'Pet Hair Remover', 'Dog Chew Toy Set', 'Cat Scratcher', 'Pet Grooming Glove', 'Portable Water Bottle'],
  baby: ['Silicone Bib', 'Baby Food Masher', 'Stroller Organizer', 'Night Light Projector', 'Teething Toy Set'],
};
function ideasFor(category, keyword) {
  const key = String(category || '').toLowerCase();
  let base = CATALOG_IDEAS[key] || [];
  if (!base.length) {
    const map = { '주방': 'kitchen', '전자': 'electronics', '가전': 'electronics', '뷰티': 'beauty', '화장품': 'beauty', '홈': 'home', '생활': 'home', '운동': 'fitness', '피트니스': 'fitness', '반려': 'pet', '펫': 'pet', '육아': 'baby', '유아': 'baby' };
    for (const k of Object.keys(map)) if (key.includes(k)) base = CATALOG_IDEAS[map[k]];
  }
  if (!base.length) base = [].concat(...Object.values(CATALOG_IDEAS)).slice(0, 10);
  if (keyword) {
    const kw = keyword.trim();
    const variants = [kw, kw + ' Pro', kw + ' Set', kw + ' Mini', 'Portable ' + kw, kw + ' 2-Pack'];
    base = variants.concat(base).slice(0, 12);
  }
  return base.slice(0, 10);
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

// 후보 1건 평가
async function evaluate(idea, market, rates, rule, budgetKRW) {
  const overseas = market === 'amazon' || market === 'ebay';
  const probe = { sku: 'PROBE', title_en: idea, title: idea, markets: [market], price_usd: 0, price: 0 };
  const res = await competitor.search(probe, market);
  const comps = (res.competitors || []).filter(c => c.price > 0);
  if (!comps.length) return null;
  const prices = comps.map(c => c.price).sort((a, b) => a - b);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const min = prices[0], max = prices[prices.length - 1];
  const spread = max > 0 ? (max - min) / max : 0;
  const reviews = comps.reduce((s, c) => s + (c.reviews || 0), 0);
  const ratingAvg = comps.filter(c => c.rating).length ? comps.filter(c => c.rating).reduce((s, c) => s + c.rating, 0) / comps.filter(c => c.rating).length : 0;

  // 통화 → KRW 환산한 시장 평균가·추정 원가
  const krw = rates.KRW || 1350;
  const avgKRW = overseas ? avg * krw : avg;
  const estCostKRW = Math.round(avgKRW * 0.35);        // 소싱 원가 가정(시장가의 35%)
  const sellPrice = await pricing.computePrice(estCostKRW, market, rule, rates); // 규칙 적용 판매가(마켓통화)
  const sellKRW = overseas ? sellPrice * krw : sellPrice;
  const estMarginPct = sellKRW > 0 ? clamp(Math.round((sellKRW - estCostKRW - sellKRW * (rule.feePct / 100)) / sellKRW * 100), 0, 95) : 0;

  // 점수화(0~100)
  const demandScore = clamp(Math.round(Math.log10(reviews + 10) / Math.log10(30000) * 100), 0, 100); // 리뷰 많을수록 수요↑
  const competitionScore = clamp(Math.round((spread * 60) + (comps.length <= 6 ? 40 : comps.length <= 8 ? 25 : 10)), 0, 100); // 가격 분산 크고 경쟁 적을수록↑
  const marginScore = clamp(Math.round(estMarginPct / 45 * 100), 0, 100);
  const budgetFit = (!budgetKRW || estCostKRW <= budgetKRW) ? 1 : 0.4; // 예산 초과면 감점
  const sourcingScore = Math.round((0.35 * demandScore + 0.4 * marginScore + 0.25 * competitionScore) * budgetFit);

  const reason = `시장 평균 ${overseas ? '$' + avg.toFixed(2) : '₩' + Math.round(avg).toLocaleString()}, 경쟁 ${comps.length}곳, 예상 마진 ${estMarginPct}%` + (ratingAvg ? `, 평점 ${ratingAvg.toFixed(1)}` : '');
  return {
    idea, market, currency: overseas ? 'USD' : 'KRW',
    marketAvg: overseas ? +avg.toFixed(2) : Math.round(avg),
    marketMin: overseas ? +min.toFixed(2) : Math.round(min),
    competition: comps.length, reviews, ratingAvg: +ratingAvg.toFixed(1),
    estCostKRW, suggestedPrice: sellPrice, estMarginPct,
    demandScore, competitionScore, marginScore, sourcingScore,
    budgetOver: budgetKRW ? estCostKRW > budgetKRW : false,
    reason, provider: res.provider,
  };
}

async function discover({ category, keyword, market = 'amazon', budgetKRW = 0 }, db) {
  const rates = await fx.rates();
  const rule = pricing.getRules(db)[market] || pricing.DEFAULT_RULES[market];
  const ideas = ideasFor(category, keyword);
  const out = [];
  for (const idea of ideas) {
    try { const r = await evaluate(idea, market, rates, rule, budgetKRW); if (r) out.push(r); }
    catch (_) {}
  }
  out.sort((a, b) => b.sourcingScore - a.sourcingScore);
  return { market, fxKRW: Math.round(rates.KRW || 1350), candidates: out };
}

module.exports = { discover, ideasFor };
