'use strict';
// 리뷰 수집 어댑터(마켓별). 기본 mock, 실연동 자리(아마존 PA-API/SP-API, eBay Feedback, 네이버 등).
// 공개 리뷰 API가 제한적인 마켓이 많아 기본은 mock, 키/권한 확보 시 실수집으로 교체.

function sentimentOf(rating) { return rating >= 4 ? 'positive' : rating === 3 ? 'neutral' : 'negative'; }

// mock: 상품별 결정적 리뷰 생성
function fetchMock(product, market, days) {
  const seedBase = (product.sku + market).split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) & 0x7fffffff, 7);
  let seed = seedBase;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const authors = ['Jiwoo', 'Alex', 'Minseo', 'Chris', 'Hana', 'Daniel', 'Sora', 'Mike', 'Yuna', 'Tom'];
  const posTpl = [
    'Great quality for the price, very satisfied.',
    'Works exactly as described. Fast shipping too.',
    'Love it, would buy again.',
    'Exceeded my expectations, highly recommend.',
  ];
  const negTpl = [
    'Arrived damaged, very disappointed.',
    'Not as described, the quality is poor.',
    'Stopped working after a few days.',
    'Shipping took too long and packaging was bad.',
  ];
  const neuTpl = ['It is okay, nothing special.', 'Average product, does the job.'];
  const n = 3 + Math.floor(rnd() * 6);
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = rnd();
    const rating = r < 0.2 ? 1 + Math.floor(rnd() * 2) : r < 0.35 ? 3 : 4 + Math.floor(rnd() * 2);
    const sentiment = sentimentOf(rating);
    const tpl = sentiment === 'negative' ? negTpl : sentiment === 'neutral' ? neuTpl : posTpl;
    out.push({
      reviewId: market.toUpperCase().slice(0, 2) + '-' + product.sku + '-R' + i,
      market, sku: product.sku, productTitle: product.title_en || product.title,
      author: authors[Math.floor(rnd() * authors.length)],
      rating, sentiment,
      text: tpl[Math.floor(rnd() * tpl.length)],
      at: Date.now() - Math.floor(rnd() * days) * 86400000,
    });
  }
  return out.sort((a, b) => b.at - a.at);
}

async function fetchReviews(product, market, creds = {}, days = 90) {
  // 실연동 자리: 마켓별 리뷰/피드백 API가 확보되면 여기서 분기
  return { provider: 'mock', market, reviews: fetchMock(product, market, days) };
}

module.exports = { fetchReviews, sentimentOf };
