# 카드 일러스트

채택된 일러스트 35장(영웅 28 + 김인턴 직급 7)은 `node scripts/genCardsHF.mjs`가 Animagine XL 4.0(Hugging Face 공개 Space)으로 생성한 PNG(832×1216, 블루 아카이브 톤)입니다. 특정 카드만 다시 뽑기: `node scripts/genCardsHF.mjs --force ceo`, 다른 시드: `SEED=5 node scripts/genCardsHF.mjs --force ceo`. 대체용으로 `scripts/portraits.mjs`(SVG 벡터)와 `scripts/genCards.mjs`(pollinations, 반사실 톤)도 남아 있습니다. 리뷰 그리드: `scripts/cardReview.html`.

`manifest.json`에 영웅 id → 파일명을 적고 이 폴더에 이미지를 넣으면, 해당 영웅의 **카드 · 초상 · 뽑기 연출**이 픽셀 아트 대신 일러스트를 씁니다. 나머지 영웅은 그대로 픽셀 아트라서 한 명씩 교체할 수 있습니다.

```json
{ "cards": { "ceo": "ceo.png", "coo": "coo.webp" } }
```

- 권장 규격: 512×512 PNG/WebP (또는 3:4 세로 384×512). 상반신(bust-up), 얼굴이 위쪽 1/2 안에 오도록.
- 카드(112×150)는 위쪽 112×112를 cover 방식으로 채우므로 얼굴이 위에 있어야 잘립니다.
- 영웅 id는 `src/data/heroes.js` (메인 영웅은 `main`).
- 생성용 프롬프트와 스타일 가이드: `docs/ART_PROMPTS.md` (`node scripts/artPrompts.mjs`로 재생성).
