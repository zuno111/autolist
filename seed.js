'use strict';
// 데모 시드 데이터. 최초 실행 시 로그인·샘플 상품 제공.
function seed() {
  return {
    rev: 1,
    users: [
      // 비밀번호: admin1234 (bcrypt) — 최초 로그인 후 변경 권장
      // 최초 로그인: admin@autolist.local / admin1234 (서버 기동 시 해시 생성)
      { id: 'u_admin', email: 'admin@autolist.local', name: '관리자', role: 'admin',
        pwPlain: 'admin1234',
        plan: 'enterprise', amazon: {}, refreshTokens: [], createdAt: Date.now() },
    ],
    products: [
      { id: 'p1', owner: 'u_admin', sku: 'IG-TUMBLER-500', title: '스테인리스 보온 텀블러 500ml',
        title_en: 'Stainless Steel Insulated Tumbler 500ml Travel Mug',
        brand: 'STUDIO ig', manufacturer: 'STUDIO ig', category: 'Kitchen',
        cost: 8000, price: 19900, price_usd: 16.99, stock: 120,
        images: ['https://images.example.com/tumbler-main.jpg', 'https://images.example.com/tumbler-2.jpg'],
        description: '<p>이중 진공 단열로 12시간 보온, 24시간 보냉.</p>',
        description_en: 'Double-wall vacuum insulation keeps drinks hot for 12 hours and cold for 24 hours.',
        bullets_en: [
          'LONG-LASTING TEMPERATURE: Keeps beverages hot 12h / cold 24h with double-wall vacuum insulation.',
          'LEAK-PROOF LID: Secure screw-on lid prevents spills in your bag.',
          'BPA-FREE 304 STAINLESS STEEL: Safe, durable, and rust-resistant.',
          'FITS CUP HOLDERS: Slim 500ml body fits most car and stroller holders.',
          'EASY TO CLEAN: Wide mouth for easy filling and cleaning.',
        ],
        options: [{ name: 'Color', values: ['Black', 'Silver', 'Navy'] }],
        keywords: 'tumbler, travel mug, insulated bottle, stainless steel',
        weight: '320g', origin: 'South Korea', condition: 'New', status: 'active',
        markets: ['amazon'], createdAt: Date.now() },
    ],
    sellers: [],          // B2B: 외부 셀러 계정(관리자와 분리)
    uploads: [],          // 업로드 이력
    exports: [],          // 생성 파일 이력
    subscriptions: {},    // scopeId(user.id) → {plan,status,...}
    aiUsage: [],          // AI 생성 사용량 로그
    orders: [],           // 주문(셀러별, 멀티마켓)
    inventoryLog: [],     // 재고 동기화 이력
    settings: {},         // 가격 규칙·배송비 등 설정
    priceWatch: {},       // sku → [{at, min, avg, myPrice}] 경쟁가 스냅샷
    alerts: [],           // 가격 변동·추적 알림
    reviews: [],          // 수집된 마켓 리뷰
    pushSubs: {},         // userId → [웹푸시 구독]
  };
}
module.exports = { seed };
