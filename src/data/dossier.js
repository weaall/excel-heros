// 인사 기록 카드 — every character's file, laid out the way blue-utils lays out a student.
//
// blue-utils gives each student the same blocks: name and reading, birthday / age / height /
// hobby, a two-paragraph introduction, school · year · club, position (FRONT/MIDDLE/BACK),
// attack and defence type, role, terrain affinity, three equipment slots, seasonal outfits, a
// UNIQUE WEAPON with a paragraph, a FAVOURITE ITEM with a paragraph, a memorial lobby and four
// skills. This file supplies the company equivalents that cannot be computed; the rest is
// derived below from data the character already has, so nothing here can drift from it.
//
//   학원        → 부서 (profiles.dept)          학년 → 연차 (derived)
//   동아리      → 소속 파트 (team, below)        고유무기 → 고유 업무 도구 (tool, below)
//   애용품      → 애용품 (fav, below)            헤일로 → 등 뒤 시트 (design.js)
//   공격 타입   → 업무 타입 (derived from trait) 방어 타입 → 복장 타입 (derived from outfit)
//   지형 적성   → 근무지 적성: 사무실 · 외근 · 재택 (derived)
//
// Hand-written fields: en (the name as it is romanised on the badge), team, tool {name, kind,
// text}, fav {name, text}, recruit (the one-line "party wanted" note blue-utils shows), and
// age / tenure where the character's story states a length of service.
import { hash } from './design.js';

export const DOSSIER = {
  main:           { age: 26, tenure: 3, en: 'Kim Intern',        team: '경영지원본부 지원파트', tool: { name: '단축키 치트시트', kind: '키보드', text: '모니터 아래에 붙여 둔 손바닥만 한 표. 400개를 외운 지금도 떼지 않는 건, 떼는 날 인턴도 끝날 것 같아서다.' }, fav: { name: '편의점 삼각김밥', text: '야근 후 편의점에서 늘 같은 참치마요. 계산대 직원이 이제 먼저 꺼내 준다.' }, recruit: '야근 메이트 구합니다… (1/5)' },
  staff_park:     { age: 27, tenure: 3, en: 'Park Sawon',        team: '총무팀 사무지원파트', tool: { name: '청축 기계식 키보드 "딸깍 1호"', kind: '키보드', text: '입사 첫 달 월급으로 산 키보드. 옆자리가 소리로 업무를 알아맞히는 건 이 키보드 탓이다.' }, fav: { name: '손목 받침대', text: '3년째 같은 젤 패드. 모양이 손목대로 파여 다른 사람은 못 쓴다.' }, recruit: '타자 속도 대결 상대 구함 (1/2)' },
  parttime:       { age: 25, tenure: 3, en: 'Lee Alba',          team: '리셉션 방문객파트', tool: { name: '방문객 명부 클립보드', kind: '클립보드', text: '서류를 던져 건네는 그 클립보드. 모서리가 둥글게 닳은 건 3년간 한 번도 떨어뜨린 적이 없어서다.' }, fav: { name: '네일 스티커 세트', text: '요일마다 다른 색. 방문객 절반은 이걸로 요일을 안다.' }, recruit: '드라마 정주행 같이 하실 분 (2/4)' },
  guard:          { age: 54, tenure: 20, en: 'Guard Captain',     team: '보안팀 1층 출입파트', tool: { name: '20년 된 무전기', kind: '무전기', text: '안테나가 테이프로 감긴 무전기. 새것을 지급받고도 서랍에 넣어 두고 이걸 쓴다.' }, fav: { name: '보온병 보리차', text: '새벽 근무마다 집에서 끓여 오는 보리차. 늦게 퇴근하는 사원에게 한 잔씩 따라 준다.' }, recruit: '새벽 등산 동행 (1/3)' },
  barista:        { en: 'Barista Kang',      team: '사내 카페 2층점', tool: { name: '스팀 피처 "라떼 1번"', kind: '피처', text: '라떼 아트를 처음 성공한 날부터 쓴 피처. 손잡이 쪽 도금이 벗겨졌다.' }, fav: { name: '원두 블렌드 노트', text: '팀마다 다른 블렌드를 적어 둔 수첩. 야근 팀 페이지만 유독 두껍다.' }, recruit: '블렌딩 시음단 모집 (3/6)' },
  courier:        { en: 'Courier Bae',       team: '외부 협력 배송파트', tool: { name: '송장 스캐너', kind: '스캐너', text: '한 손으로 찍고 달리는 스캐너. 비상계단에서도 신호가 잡히는 자리를 전부 안다.' }, fav: { name: '뒤축 닳은 운동화', text: '계단으로만 다녀 뒤축이 비스듬히 닳았다. 같은 모델을 세 켤레째 신는다.' }, recruit: '21층 계단 챌린지 (1/5)' },
  contract:       { en: 'Choi Contract',     team: '마케팅팀 프로모션파트', tool: { name: '경품 추첨 상자', kind: '상자', text: '3년 연속 당첨으로 추첨에서 제외된 뒤 운영을 맡게 된 상자. 이제는 뽑는 쪽이다.' }, fav: { name: '키링 다섯 개', text: '사원증 줄에 달린 경품 키링. 하나씩 사연이 있다.' }, recruit: '경품 응모 같이 해요 (2/5)' },
  vlookup:        { en: 'V. Lookup',         team: '데이터팀 참조파트', tool: { name: '범위 고정 펜', kind: '펜', text: '귀에 꽂은 펜. 모니터의 셀을 짚을 때만 쓰고, 종이에는 한 번도 쓴 적이 없다.' }, fav: { name: '#N/A 포스트잇', text: '고친 오류마다 하나씩 붙여 둔 포스트잇. 책상 옆면이 노랗다.' }, recruit: '스도쿠 스피드전 (1/4)' },
  pivot:          { en: 'Pivot Park',        team: '경영기획팀 집계파트', tool: { name: '세 줄 요약 노트', kind: '노트', text: '어떤 회의든 세 줄로 줄여 적는 노트. 네 줄이 된 적은 없다.' }, fav: { name: '분재 "소나무 2호"', text: '책상 위의 작은 소나무. 가지를 칠 때 표를 정리하는 것과 같은 표정을 짓는다.' }, recruit: '가계부 스터디 (2/5)' },
  macro:          { en: 'Macro Kim',         team: '개발팀 자동화파트', tool: { name: 'USB 세 개', kind: 'USB', text: '후드 주머니의 USB 세 개. 하나는 매크로, 하나는 백업, 하나는 아무도 모른다.' }, fav: { name: '에너지 드링크', text: '심야 게임과 자동화 스크립트의 연료. 캔을 쌓아 탑을 만든 적이 있다.' }, recruit: '매크로 짜 드립니다 (0/∞)' },
  hr_jung:        { en: 'Jung Daeri',        team: '인사팀 복리후생파트', tool: { name: '강아지 스티커 클립보드', kind: '클립보드', text: '연차 신청서가 끼워진 클립보드. 스티커를 보고 긴장을 푸는 사원이 많다.' }, fav: { name: '수제 쿠키 상자', text: '주말에 구운 쿠키. 결재를 받으러 온 사람에게 하나씩 나눠 준다.' }, recruit: '반려견 산책 모임 (3/6)' },
  audit_han:      { en: 'Han Audit',         team: '감사팀 재무감사파트', tool: { name: '빨간 펜 세 자루', kind: '펜', text: '굵기가 다른 빨간 펜 세 자루. 가장 가는 것으로 쓴 지적이 가장 무섭다는 평이다.' }, fav: { name: '실내용 선글라스', text: '눈을 보면 상대가 말을 멈춘다는 걸 안 뒤부터 쓴 선글라스.' }, recruit: '추리소설 독서회 (2/4)' },
  acct_lead:      { en: 'Acct. Seo',         team: '회계팀 결산파트', tool: { name: '계산기 두 대', kind: '계산기', text: '오른손용과 왼손용. 두 대를 동시에 두드리는 소리로 월말이 온 걸 안다.' }, fav: { name: '주판', text: '어릴 때 쓰던 주판. 계산기가 고장 나면 꺼낸다. 아직 고장 난 적은 없다.' }, recruit: '결산 번개 모임 (1/3)' },
  dev_lead:       { en: 'Hotfix Lee',        team: '개발팀 플랫폼파트', tool: { name: '식은 커피 두 잔', kind: '머그', text: '늘 책상 위에 두 잔. 하나는 잊은 것, 하나는 어제 것. 장애가 나면 둘 다 마신다.' }, fav: { name: '기계식 손목시계', text: '분해했다가 다시 조립한 시계. 부품 하나가 남았지만 잘 간다.' }, recruit: '자전거 출근 모임 (2/5)' },
  ga_lead:        { en: 'Chief Go',          team: '총무팀 시설파트', tool: { name: '열쇠 뭉치', kind: '열쇠', text: '회사의 모든 문 열쇠. 소리만으로 그녀가 몇 층에 있는지 알 수 있다.' }, fav: { name: '목공 대패', text: '직접 만든 서랍장이 총무팀에 셋 있다. 비품 신청서가 필요 없는 가구다.' }, recruit: '공구 정리 봉사 (1/4)' },
  welfare:        { en: 'Welfare Min',       team: '복지팀 간식파트', tool: { name: '간식 창고 열쇠', kind: '열쇠', text: '회사에서 가장 인기 있는 열쇠. 복제 요청을 전부 거절했다.' }, fav: { name: '뜨개 스카프', text: '직접 뜬 스카프. 겨울마다 한 명씩 선물하는데 순서가 정해져 있다.' }, recruit: '신상 간식 시식단 (4/6)' },
  cfo:            { en: 'C.F.O.',            team: '재무본부 예산총괄', tool: { name: '멈춘 회중시계', kind: '시계', text: '전임 CFO에게 물려받은 회중시계. 시계는 멈췄고 줄만 찬다. 예산 회의에서만 꺼낸다.' }, fav: { name: '체스판', text: '점심마다 혼자 두는 체스. 상대는 지난 분기의 자신이다.' }, recruit: '체스 상대 구함 (0/1)' },
  cto:            { en: 'C.T.O.',            team: '기술본부 아키텍처', tool: { name: '한 줄 리팩토링 노트북', kind: '노트북', text: '스티커 하나 없는 노트북. 서버를 살린 한 줄이 이 안에 있다.' }, fav: { name: '낡은 팀 밴드', text: '첫 서비스 런칭 때 팀이 맞춘 손목 밴드. 끊어질 때까지 찬다.' }, recruit: '보드 타러 가실 분 (2/4)' },
  coo:            { age: 51, tenure: 20, en: 'C.O.O.',            team: '운영본부 총괄', tool: { name: '만년필 두 자루', kind: '만년필', text: '하나는 결재용, 하나는 메모용. 20년간 한 번도 섞어 쓴 적이 없다.' }, fav: { name: '현장 순찰 수첩', text: '지시 전에 도는 현장 순찰 기록. 첫 장은 신입 때 쓴 것이다.' }, recruit: '전략 보드게임 (3/5)' },
  ceo:            { en: 'C.E.O.',            team: '대표이사실', tool: { name: '창립 기념 반지', kind: '반지', text: '왼손 약지의 반지. 창업자·회장과 같은 것이다. 결혼반지로 오해받는 걸 굳이 바로잡지 않는다.' }, fav: { name: '서예 붓', text: '말을 줄이기 위해 시작한 서예. 한 글자만 쓰는 날이 많다.' }, recruit: '승마 동호회 (1/3)' },
  chairman:       { age: 72, tenure: 40, en: 'Chairman',          team: '회장실', tool: { name: '손 모양으로 닳은 지팡이', kind: '지팡이', text: '40년 동안 같은 자리를 잡아 손 모양으로 닳은 지팡이. 걷는 데보다 회의에서 쓸 일이 많다.' }, fav: { name: '오래된 사진첩', text: '창립 첫해의 사진첩. 사진 속 사람을 전부 이름으로 부른다.' }, recruit: '아침 산책 (1/2)' },
  helpdesk:       { en: 'Help Desk',         team: 'IT 지원팀 1선', tool: { name: '한쪽 헤드셋', kind: '헤드셋', text: '한쪽만 걸치는 헤드셋. 나머지 귀로 사무실의 비명을 듣는다.' }, fav: { name: '조립 PC 부품함', text: '서랍 가득한 여분 부품. 누군가의 PC가 죽으면 여기서 부활한다.' }, recruit: '인디게임 협동 (2/4)' },
  cleaner:        { age: 58, tenure: 20, en: 'Madam Cleaner',     team: '미화팀 새벽조', tool: { name: '20년 된 손전등', kind: '손전등', text: '같은 모델만 20년. 불 꺼진 사무실의 분실물 절반이 이 불빛에 발견된다.' }, fav: { name: '새벽 라디오', text: '청소하는 동안 켜 두는 라디오. 사연을 보낸 적이 있다.' }, recruit: '화분 나눔 (2/5)' },
  sales_kang:     { en: 'Kang Sales',        team: '영업팀 기업영업파트', tool: { name: '반쯤 빈 명함집', kind: '명함집', text: '세 번 찾아가서 한 번 악수하는 사람의 명함집. 늘 반쯤 비어 있다.' }, fav: { name: '광낸 구두', text: '구두만은 늘 새것처럼. 미팅 전 엘리베이터에서 한 번 더 닦는다.' }, recruit: '맛집 지도 공유 (3/6)' },
  legal_yoon:     { en: 'Yoon Legal',        team: '법무팀 계약파트', tool: { name: '형광펜 네 색', kind: '형광펜', text: '색마다 뜻이 정해져 있다. 그 규칙을 아는 사람은 본인뿐이다.' }, fav: { name: '필사 노트', text: '판결문을 손으로 옮겨 적는 노트. 글씨가 조항처럼 반듯하다.' }, recruit: '요가 아침반 (2/4)' },
  pm_lead:        { en: 'PM Ahn',            team: '기획팀 신사업파트', tool: { name: 'A4 한 장', kind: '기획서', text: '회의에 들고 가는 단 한 장. 그 한 장을 위해 열 장을 버린다.' }, fav: { name: '전시회 티켓 모음', text: '다녀온 전시 티켓을 코르크판에 꽂아 둔다. 기획이 막히면 한 장씩 뺀다.' }, recruit: '전시 관람 번개 (2/5)' },
  design_lead:    { en: 'Pixel Oh',          team: '디자인팀 브랜드파트', tool: { name: '색 바랜 컬러칩 링', kind: '컬러칩', text: '신입 때 선배에게 받은 컬러칩. 색이 바랬지만 기준은 여전히 이것이다.' }, fav: { name: '폰트 샘플북', text: '모은 폰트를 직접 인쇄해 묶은 책. 첫 페이지는 손글씨다.' }, recruit: '크로키 모임 (3/6)' },
  cmo:            { en: 'C.M.O.',            team: '마케팅본부 총괄', tool: { name: '한쪽 귀걸이', kind: '귀걸이', text: '늘 한쪽만. 나머지 한쪽은 다음 캠페인이라고 한다.' }, fav: { name: '실패 캠페인 목록', text: '사무실 벽에 붙인 실패작 목록. 성공작보다 길다.' }, recruit: '빈티지 마켓 탐방 (2/4)' },
  founder:        { en: 'Founder',           team: '이사회', tool: { name: '차고 공구함', kind: '공구함', text: '회사를 시작한 차고의 공구함. 지금도 고장 난 것은 직접 고친다.' }, fav: { name: '해진 카디건', text: '팔꿈치가 해진 카디건. 애착이 아니라 관심이 없어서 입는다고 한다.' }, recruit: '중고 부품 수리 (1/3)' },
  intern_seo:     { age: 22, tenure: 1, en: 'Seo Intern',        team: '경영지원본부 인턴', tool: { name: '복사기 드라이버', kind: '드라이버', text: '입사 첫날 복사기를 고친 드라이버. 이제 고장 난 기계가 있으면 다들 그녀를 부른다.' }, fav: { name: '다꾸 스티커북', text: '하루를 스티커로 정리하는 다이어리. 월말 결산보다 알록달록하다.' }, recruit: '카페 투어 (3/5)' },
  pr_yoo:         { en: 'Yoo PR',            team: '홍보팀 언론파트', tool: { name: '목걸이 녹음기', kind: '녹음기', text: '한 번 놓친 인터뷰 뒤로 목에 거는 녹음기. 샤워할 때 빼고 켜져 있다.' }, fav: { name: '정장용 운동화', text: '기자실까지 뛰어야 하는 날을 위한 운동화. 일주일에 두 번은 필요하다.' }, recruit: '단거리 러닝 크루 (2/6)' },
  nurse_han:      { en: 'Nurse Han',         team: '사내 의무실', tool: { name: '불룩한 가운 주머니', kind: '구급 키트', text: '누가 무엇을 필요로 할지 몰라 채워 둔 주머니. 밴드, 사탕, 물티슈, 볼펜.' }, fav: { name: '약초차 티백', text: '야근하는 사람에게 건네는 차. 맛이 쓰다는 평이 대부분이다.' }, recruit: '스트레칭 타임 (4/8)' },
  lab_park:       { en: 'Dr. Park',          team: '연구소 예측모델파트', tool: { name: '수식 한 줄 칠판', kind: '칠판', text: '연구실 칠판에 늘 한 줄만 남겨 둔다. 매출 예측이 그 한 줄에서 나온다.' }, fav: { name: '가운 위의 담요', text: '밤샘용 담요. 가운 위에 두르고 다니는 모습이 연구소의 풍경이 되었다.' }, recruit: '천체 관측 (1/4)' },
  chro:           { en: 'C.H.R.O.',          team: '인사본부 총괄', tool: { name: '두 손 명함', kind: '명함', text: '명함은 두 손으로만 건넨다. 신입 때 배운 것을 임원이 되어서도 지킨다.' }, fav: { name: '심리학 책', text: '구조조정 회의 전날 밤에 다시 읽는 책. 밑줄이 매번 늘어난다.' }, recruit: '저녁 산책 (2/4)' },
  cso:            { en: 'Seo Haneul',        team: '전략기획실', tool: { name: '손으로 그린 시장 지도', kind: '지도', text: '접힌 종이 지도. 실제 지도가 아니라 10년 뒤 시장을 직접 그린 것이다.' }, fav: { name: '별 모양 귀걸이', text: '장기 예보를 읽는 밤마다 다는 귀걸이. 별자리가 바뀌면 전략도 바뀐다고 농담한다.' }, recruit: '지도 수집 교류 (1/3)' },
  ai_lead:        { en: 'Luna',              team: 'AI연구소', tool: { name: 'LED 안경테', kind: '안경', text: '연구실 장비 상태 표시등이 달린 안경. 색이 바뀌면 그녀가 먼저 일어선다.' }, fav: { name: '민트 화분', text: '연구실 창가의 민트. 모델이 학습하는 동안 잎을 센다.' }, recruit: '로봇 조립 스터디 (2/4)' },
  union_chief:    { en: 'Kang Cheol',        team: '노동조합', tool: { name: '단체 협약서', kind: '협약서', text: '한 장짜리 협약서. 이 한 장으로 회사를 지킨다는 게 그녀의 말버릇이다.' }, fav: { name: '노래방 마이크', text: '회식마다 첫 곡을 맡는다. 목소리가 크지만 손은 따뜻하다.' }, recruit: '주말 등산 (4/10)' },
  hacker:         { en: 'Zero',              team: '보안연구소', tool: { name: '형광 헤드셋', kind: '헤드셋', text: '발표 자리에서도 벗지 않는 헤드셋. 한쪽에서는 늘 로그가 흘러간다.' }, fav: { name: '자물쇠 컬렉션', text: 'CTF 상품으로 받은 자물쇠들. 전부 열 수 있다.' }, recruit: 'CTF 팀원 모집 (2/4)' },
  intern_min:     { age: 23, tenure: 1, en: 'Minji',             team: '경영지원본부 인턴', tool: { name: '이모티콘 팩', kind: '메신저', text: '직접 그린 메신저 이모티콘. 팀 채팅방의 분위기가 이것으로 정해진다.' }, fav: { name: '매일 바뀌는 리본', text: '리본이 트레이드마크지만 매일 다른 것이라는 건 잘 알려지지 않았다.' }, recruit: '응원 구호 공모 (3/6)' },
  security_yang:  { en: 'Yang Security',     team: '보안팀 정문파트', tool: { name: '머리끈 세 개', kind: '머리끈', text: '손목의 머리끈 세 개. 상황마다 다른 것으로 묶는다. 묶는 순간 아무도 못 지나간다.' }, fav: { name: '검도 죽도', text: '퇴근 후 도장에서 쓰는 죽도. 경비 반장에게 선물받았다.' }, recruit: '근력 운동 파트너 (1/2)' },
  mail_cho:       { en: 'Cho Mail',          team: '총무팀 사내우편파트', tool: { name: '고무 골무', kind: '골무', text: '하루에 한 번 바꾸는 골무. 우편물을 넘기는 속도가 사람이 아니다.' }, fav: { name: '우표 앨범', text: '회사로 오는 편지의 우표를 모은다. 해외 우표는 번역팀장이 챙겨 준다.' }, recruit: '자전거 정비 모임 (2/4)' },
  qa_lee:         { en: 'Lee QA',            team: '개발팀 품질파트', tool: { name: '폰 두 대', kind: '휴대폰', text: '하나는 최신, 하나는 일부러 구형. 눌러 보지 않은 버튼이 없다.' }, fav: { name: '스티커 노트북', text: '잡은 버그 수만큼 붙인 스티커. 뚜껑이 이미 다 찼다.' }, recruit: '방탈출 팀원 (3/4)' },
  reception_go:   { en: 'Go Eun',            team: '리셉션 안내파트', tool: { name: '안내 방송 마이크', kind: '마이크', text: '한 마디에 로비가 조용해지는 마이크. 언제 말을 멈출지 아는 것이 비결이라고 한다.' }, fav: { name: '꽃 한 송이', text: '매주 직접 사 오는 꽃. 회사 예산이 아니다.' }, recruit: '꽃꽂이 원데이 (2/6)' },
  trainer_seok:   { age: 41, tenure: 12, en: 'Seok Hoon',         team: '인사팀 교육파트', tool: { name: '호루라기', kind: '호루라기', text: '한 번 불면 대열이 정렬되는 호루라기. 12년 동안 그 소리 뒤에 늘 같은 말이 따라왔다.' }, fav: { name: '조기 축구공', text: '주말 아침의 축구공. 신입 교육 동기들이 아직 함께 찬다.' }, recruit: '조기 축구 (8/11)' },
  translator_ji:  { en: 'Jia',               team: '해외사업팀', tool: { name: '종이 사전 일곱 권', kind: '사전', text: '일곱 개 언어의 종이 사전. 번역기를 쓰지 않는 이유는 오역이 회사를 죽인 걸 직접 봐서다.' }, fav: { name: '배지 일곱 개', text: '출장 간 나라마다 산 배지. 여덟 번째 자리를 비워 두었다.' }, recruit: '외국 라디오 청취 (1/3)' },
  secretary_yun:  { age: 38, tenure: 10, en: 'Yun Seo',           team: '대표이사실 비서파트', tool: { name: '분 단위 플래너', kind: '플래너', text: '빈칸이 없는 플래너. 비워 둘 시간까지 적어 두기 때문이다.' }, fav: { name: '색 구분 펜 세 자루', text: '10년째 같은 규칙으로 쓰는 세 가지 색 펜.' }, recruit: '새벽 조깅 (2/5)' },
  logistics_bae:  { en: 'Bae Cheol',         team: '물류팀 입출고파트', tool: { name: '벗지 않는 장갑', kind: '장갑', text: '언제 짐이 들어올지 몰라 벗지 않는 장갑. 지게차보다 빨리 상자를 쌓는다.' }, fav: { name: '자격증 파일', text: '지게차·크레인·위험물. 모은 자격증을 파일로 정리해 둔다.' }, recruit: '역도 파트너 (1/2)' },
  cro:            { en: 'C.R.O.',            team: '리스크관리실', tool: { name: '맑은 날의 우산', kind: '우산', text: '맑은 날에도 들고 다니는 우산. 그녀가 괜찮다고 하면 정말 괜찮다.' }, fav: { name: '재난 영화 목록', text: '최악을 먼저 계산하는 사람의 주말 목록.' }, recruit: '기상 관측 동호회 (1/3)' },
  cpo:            { en: 'C.P.O.',            team: '제품본부', tool: { name: '지우개가 먼저 닳는 연필', kind: '연필', text: '로드맵을 종이에 그리는 연필. 화면에서는 지우는 게 너무 쉽다고 한다.' }, fav: { name: '종이 프로토타입', text: '모든 제품이 먼저 종이로 만들어진다. 서랍 하나가 그것들로 차 있다.' }, recruit: '연필 깎기 모임 (1/4)' },
  ir_lead:        { en: 'I.R.',              team: 'IR팀', tool: { name: '한 장 요약', kind: '요약본', text: '스무 장을 한 장으로 줄인 요약. 숫자는 절대 반올림하지 않는다.' }, fav: { name: '와인 노트', text: '투자자와의 만찬마다 기록한 와인. 숫자보다 잘 외운다.' }, recruit: '외국어 뉴스 스터디 (2/5)' },
  labor_atty:     { en: 'Seo Rin',           team: '노무팀', tool: { name: '테이프 감은 서류 가방', kind: '서류 가방', text: '손잡이를 테이프로 감은 가방. 바꿀 시간이 없어서다.' }, fav: { name: '합창단 악보', text: '판례를 읽다 지치면 부르는 노래. 알토 파트다.' }, recruit: '합창단 알토 모집 (3/8)' },
  bd_lead:        { en: 'B.D.',              team: '사업개발실', tool: { name: '명함집 네 개', kind: '명함집', text: '재킷 네 주머니에 하나씩. 상대에 따라 꺼내는 곳이 다르다.' }, fav: { name: '인맥 지도', text: '손으로 그린 인맥 지도. 선이 겹치는 곳에서 제안이 나온다.' }, recruit: '네트워킹 번개 (5/10)' },
  cdo:            { en: 'Harin',             team: '데이터본부', tool: { name: '대시보드 태블릿', kind: '태블릿', text: '테라바이트를 한 장으로 태우는 태블릿. 숫자가 틀리면 자기 쿼리부터 의심한다.' }, fav: { name: '푸른 브리지 염색약', text: '첫 대시보드의 커서 색으로 매년 덧염색한다.' }, recruit: '신스 잼 세션 (2/4)' },
  cco:            { en: 'Miso',              team: '고객경험본부', tool: { name: '웃는 얼굴 이름표', kind: '이름표', text: '신입 때부터 매년 새 이름표에 직접 그려 넣는 웃는 얼굴.' }, fav: { name: '손편지 세트', text: '불만 고객에게 손편지를 쓴다. 답장이 팬레터로 온다.' }, recruit: '제빵 클래스 (4/6)' },
  chief_of_staff: { en: 'Yuha',              team: '대표이사실 총괄', tool: { name: '목걸이 결재 도장', kind: '도장', text: '한 번 잃어버린 뒤로 목에 거는 결재 도장. 대표가 보기 전에 결재가 끝난다.' }, fav: { name: '속독 타이머', text: '보고서 한 건에 30초. 타이머가 울리기 전에 끝난다.' }, recruit: '단거리 수영 (1/3)' },
  chairwoman:     { age: 69, tenure: 40, en: 'Chairwoman',        team: '이사회', tool: { name: '창립 기념 브로치', kind: '브로치', text: '매일 다는 브로치. 의식이 아니라 습관이다. 회장이 결정하면 그녀가 막을 것을 막는다.' }, fav: { name: '난초', text: '40년째 키우는 난초. 오래된 장부와 같은 선반에 둔다.' }, recruit: '난초 나눔 (1/2)' },
};

// ---------------------------------------------------------------- derived

/** 업무 타입 — blue-utils' attack type, with its four colours kept (red / yellow / blue / purple). */
export const WORK_TYPE = {
  수식:   { color: '#e0524d', traits: ['sturdy', 'rally', 'regen'] },
  보고서: { color: '#e8a52a', traits: ['crit', 'focus'] },
  매크로: { color: '#3b82d6', traits: ['swift', 'splash'] },
  인맥:   { color: '#9a55d0', traits: ['greedy', 'lucky', 'lifesteal'] },
};
export const workType = (trait) => Object.entries(WORK_TYPE).find(([, v]) => v.traits.includes(trait))?.[0] ?? '수식';

/** 복장 타입 — blue-utils' armour type, read off what the character actually wears. */
export function dressType(outfitText = '') {
  const o = outfitText.toLowerCase();
  if (/lab coat|nurse|smock/.test(o)) return '가운';
  if (/hoodie|cardigan|tee|sweater|knit|bomber|flannel|denim/.test(o)) return '캐주얼';
  if (/uniform|jumpsuit|work vest|work jacket|apron|coach vest|postal/.test(o)) return '작업복';
  return '정장';
}

/** 포지션 — tanks hold the front, melee the middle, everyone else the back. */
export const position = (role) => (role === 'tank' ? 'FRONT' : role === 'melee' ? 'MIDDLE' : 'BACK');
/** 전술 역할 — healers are SPECIAL (support from the back row), everyone else STRIKER. */
export const tactical = (role) => (role === 'healer' ? 'SPECIAL' : 'STRIKER');

/** 근무지 적성 — office / field / remote, S–D, stable per id. The role tilts it. */
const LADDER = ['D', 'C', 'B', 'A', 'S'];
export function sites(id, role) {
  const h = hash(id);
  const tilt = { tank: [1, 1, -1], melee: [0, 2, -1], ranged: [1, -1, 1], healer: [2, -1, 0] }[role] ?? [0, 0, 0];
  const at = (k, i) => LADDER[Math.max(0, Math.min(4, 2 + tilt[i] + ((h >> (k * 3)) % 3) - 1))];
  return { 사무실: at(0, 0), 외근: at(1, 1), 재택: at(2, 2) };
}

/** 생일 — stable per id, never Feb 29. */
export function birthday(id) {
  const h = hash(id) * 2654435761 >>> 0;
  const m = (h % 12) + 1;
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
  return `${m}월 ${((h >>> 8) % days) + 1}일`;
}

/** 나이와 연차 — the grade is roughly the career stage. */
const AGE_BAND = { D: [22, 29], C: [26, 33], B: [31, 40], A: [39, 52], S: [44, 66] };
export function age(id, grade) {
  // A story that says "20 years at the front desk" outranks the band.
  if (DOSSIER[id]?.age) return DOSSIER[id].age;
  const [lo, hi] = AGE_BAND[grade] ?? [25, 35];
  return lo + (hash(id) % (hi - lo + 1));
}
export const tenure = (id, grade) => DOSSIER[id]?.tenure ?? Math.max(1, age(id, grade) - 23 - (hash(id) % 3));
