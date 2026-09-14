# 스프라이트 시트 넣는 방법

코드로 생성되는 기본 도트 대신 **직접 만든(또는 AI로 생성한) 도트 시트**를 캐릭터별로 넣을 수 있습니다.
파일을 이 폴더에 두고 `manifest.json`에 한 줄 추가하면 게임 화면·카드·초상화·아이콘이 모두 그 시트를 사용합니다.

## 규격

- PNG, 투명 배경. 프레임 하나 = **64×64px** (다른 크기도 `frameW/frameH`로 지정 가능).
- 캐릭터는 **오른쪽을 바라봅니다** (적이 오른쫡에서 옵니다). 발 위치는 프레임 아래에서 약 4px 위.
- 권장 애니메이션 (행 단위):
  - `idle` 2프레임 (숨쉬기)
  - `walk` 4프레임
  - `attack` 3프레임 (들기 → 내지르기 → 복귀)
- 몬스터는 `idle` 2프레임만 있어도 됩니다. 몬스터는 **왼쪽을 바라봅니다**. 보스는 96×64.

## manifest.json 예시

```json
{
  "sheets": [
    {
      "id": "vlookup",
      "file": "vlookup.png",
      "frameW": 64, "frameH": 64,
      "anims": {
        "idle":   [[0,0],[1,0]],
        "walk":   [[0,1],[1,1],[2,1],[3,1]],
        "attack": [[0,2],[1,2],[2,2]]
      }
    },
    { "id": "m:circ", "file": "circ.png", "frameW": 64, "frameH": 64, "anims": { "idle": [[0,0],[1,0]] } },
    { "id": "m:boss", "file": "boss.png", "frameW": 96, "frameH": 64, "anims": { "idle": [[0,0],[1,0]] } }
  ]
}
```

`[열, 행]` 순서로 시트 안의 프레임 위치를 적습니다.

## id 목록

- 영웅 카드: `staff_park, parttime, guard, barista, courier, contract, vlookup, pivot, macro, hr_jung, audit_han, acct_lead, dev_lead, ga_lead, welfare, cfo, cto, coo, ceo, chairman`
- 메인 영웅 직급: `intern, staff, senior, manager, sales, finance, admin`
- 몬스터(색 변형은 하나의 시트를 공유): `m:circ, m:merged, m:ref, m:virus, m:ghost, m:sheet, m:chart, m:hourglass, m:lock, m:bug, m:cloud, m:cursor`, 보스 `m:boss`

시트가 없는 id는 기존 코드 생성 도트를 그대로 씁니다. 그래서 한 캐릭터씩 점진적으로 교체할 수 있습니다.
