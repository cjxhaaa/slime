/**
 * 한국어.
 *
 * Korean has this vocabulary too, as 한자어 — 연기, 축기, 금단, 원영 — and **modern Korean writes
 * them in Hangul**. Writing 練氣 in Hanja would look like a textbook or a stele, not a game, and the
 * 무협 / 선협 that Korean readers actually read is set in Hangul throughout. So:
 *
 * - **Hangul everywhere**, including the terms that are Chinese in origin. 부적, 검기, 뇌법, 단화.
 * - **The 한자어 reading, not a native-Korean coinage.** 검기 rather than 칼기운: the genre's own
 *   register is Sino-Korean and a native compound reads as parody.
 * - **Spacing is the trap.** Korean orthography spaces differently from Chinese and Japanese, and
 *   getting it wrong is the most visible possible error to a native reader. 「부적 한 장에 적 하나」
 *   spaces after the counter; 「몸을 두르고 돈다」 spaces the verb.
 * - Interface text is plain modern Korean: 설정, 하나 고르기, 그만두기.
 *
 * Same caveat as the Japanese, more strongly: **I am confident in the vocabulary and much less so in
 * the particles and the spacing.** This should be read by a native speaker before it ships.
 */
import type { Dictionary } from './types.js';

export const ko: Dictionary = {
  realms: ['연기', '축기', '금단', '원영', '화신', '연허', '합체', '대승'],
  ascended: '비승함',
  stages: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
  realmStage: '{realm} {stage}층',
  fullness: ['수위 초응', '수위 점영', '수위 임박', '돌파 가능'],

  schools: {
    符: { name: '부적', blurb: '부적을 던져, 한 장에 적 하나' },
    剑: { name: '검기', blurb: '한 줄기를 베어 보내 지나는 길을 끊는다' },
    雷: { name: '뇌법', blurb: '벼락을 내리고 가까운 쪽으로 옮겨붙는다' },
    火: { name: '단화', blurb: '떨어진 자리에서 타오른다' },
    冰: { name: '빙백', blurb: '몸 둘레가 한기, 들어온 것은 느려진다' },
    风: { name: '풍인', blurb: '몸을 두르고 돈다' },
    土: { name: '산악', blurb: '한 대를 대신 맞고, 깨지며 밀어낸다' },
    毒: { name: '장기', blurb: '지나간 자리가 독이 된다' },
    影: { name: '영위', blurb: '그림자 하나가 스스로 싸운다' },
  },

  combos: {
    符雷: { name: '뇌부', blurb: '부적이 닿은 자리에서 한 줄기가 갈라져 가까운 적에게' },
    符剑: { name: '부검', blurb: '부적이 세 호흡 몸을 돌고 나서 날아간다' },
    符土: { name: '진부', blurb: '부적이 날지 않고 땅에 진을 이룬다' },
    符影: { name: '괴부', blurb: '영위도 부적을 던진다' },
    剑风: { name: '풍검', blurb: '사방으로 한 줄기씩' },
    剑雷: { name: '뇌검', blurb: '벨 때마다 곁으로 벼락이 떨어진다' },
    雷火: { name: '뇌화', blurb: '땅의 불이 가까운 곳으로 벼락을 부른다' },
    火冰: { name: '빙화', blurb: '한기 속에서 불붙은 적은 터진다' },
    火毒: { name: '분장', blurb: '장기에 불이 붙어 한 면이 타오른다' },
    冰风: { name: '풍설', blurb: '풍인이 서리 자국을 끌고, 그 자국도 벤다' },
    冰土: { name: '현빙갑', blurb: '껍질이 깨져도 스스로 다시 언다' },
    风毒: { name: '풍독', blurb: '장기가 더 넓게 흩어지고 떠다닌다' },
    土影: { name: '유양', blurb: '껍질이 깨질 때 땅에서 영위 둘이 솟는다' },
    毒影: { name: '영독', blurb: '영위의 일격마다 독이 실린다' },
  },

  triads: {
    符剑雷: { name: '삼재검진', blurb: '부적이 땅에 진을 이루고 벼락이 그 위로 떨어지며 검기가 진을 따라 돈다' },
    符土影: { name: '유도인', blurb: '껍질이 깨질 때 땅에 부적진이 떠오르고 영위 셋이 걸어 나온다' },
    雷火冰: { name: '삼재겁', blurb: '땅의 불이 떨어진 자리에 벼락이 내리고 한서리가 둥글게 터진다' },
    冰风土: { name: '현상벽', blurb: '풍인이 몸을 떠나 한기의 가장자리에 박혀 도는 얼음벽이 된다' },
    风剑毒: { name: '장풍인', blurb: '검기가 독을 두르고 날아 지나간 자리에 독을 남긴다' },
    毒火影: { name: '업화귀', blurb: '영위가 온몸으로 타오르며 지나간 자리에 불이 번진다' },
    土冰影: { name: '현명갑', blurb: '영위가 떠돌지 않고 갑을 따라 곁을 돌며 지킨다' },
  },

  evolutions: {
    符: { name: '만부조원', blurb: '숨마다 한 장, 결코 빗나가지 않는다' },
    剑: { name: '만검귀종', blurb: '베어 보내는 것은 한 줄기가 아니라 한 무리' },
    雷: { name: '구천신뢰', blurb: '벼락이 적을 따라 끝까지 번져 간다' },
    火: { name: '분천로', blurb: '불이 꺼지지 않고, 게다가 따라온다' },
    冰: { name: '현빙옥', blurb: '한기 안에서는 걷는 것이 멈춘다' },
    风: { name: '강풍진', blurb: '세 겹의 풍인이 서로 반대로 돈다' },
    土: { name: '부동명산', blurb: '껍질은 더 이상 깨지지 않고 밀어낼 뿐' },
    毒: { name: '만독고', blurb: '장기가 적을 쫓아간다' },
    影: { name: '영위삼중', blurb: '영위 셋' },
  },

  breeds: {
    drift: '유혼',
    dart: '분살',
    weave: '전혼',
    split: '열백',
    heavy: '중살',
    root: '정살',
  },

  finds: [
    '하품 영석 세 개를 주웠다',
    '남은 책장 한 쪽을 우연히 얻었다',
    '돌 틈에서 영근 반 토막을 캐냈다',
    '처마 밑에서 아침이슬을 한 움큼 받았다',
    '바람결에 향 냄새가 한 가닥 실려 왔다',
    '영기가 남은 낡은 나무를 갉았다',
    '벽 모퉁이에 영지가 하나 돋았다',
    '누가 흘린 옥간을 하나 주웠다',
    '한나절 햇볕을 쬐었다',
    '들열매를 잘못 먹었는데 약이 되었다',
    '지나가는 도음을 반쯤 들었다',
    '비 갠 뒤 웅덩이에 별자리가 비쳤다',
    '자판 틈에서 단사 한 알을 집어냈다',
    '떨어지는 복사꽃 한 장을 받았다',
    '자는 사이에 달빛을 한 모금 삼켰다',
    '지나가던 검기를 한 줄기 스쳤다',
    '헌책 더미에서 부적 한 장이 나왔다',
    '버리는 걸 잊은 식은 차를 마셨다',
    '창턱에서 맑은 바람을 한 줌 거두었다',
    '트림을 했더니 영광이 나왔다',
  ],

  pet: {
    readyToBreak: '{stage} · 돌파 가능\n눌러서 도겁',
    ordealSure: '도겁에 근심이 없다',
    ordealSteady: '도겁이 온당하다 · {short}장 더 모으면 근심이 없다',
    ordealFair: '도겁을 시도할 만하다 · {short}장 더 모으면 근심이 없다',
    ordealPerilous: '도겁이 위험하다 · {short}장 더 모으면 근심이 없다',
    refineLeft: '오늘은 {left}번 더 연화할 수 있다',
    ordealFailed: '도겁에 실패했다\n부록이 모두 흙어지고 · 수위를 잃었다',
    ascendedIdle: '이 몸은 이미 대도를 증명했다\n설정에서 환생할 수 있다',
    firstBreath: '이것에 영성이 있는 듯\n천지의 기를 삼키고 뱉는다',
  },

  menu: {
    settings: '설정…',
    enterTrial: '역련 들어가기',
    leaveTrial: '역련 끝내기',
    lockedUntil: '축기부터',
  },

  draft: {
    choose: '하나 고르기',
    newSchool: '새 법',
    raise: '정진',
    evolve: '★ 진화',
    mend: '조식',
    mendTitle: '호체',
    mendBlurb: '호체를 셋 회복',
    levelStep: '{from}중 → {to}중',
    pairsWith: '{school}과 합 · {combo}',
    triadWith: '삼합 · {triad}',
  },

  trial: {
    survived: '역련을 마쳤다\n제사 {kills} · 수위가 크게 늘었다',
    overwhelmed: '호체가 다 깨졌다\n제사 {kills} · 수위가 조금 늘었다',
    arena: '연무를 마쳤다\n명중 {kills} · 수위는 늘지 않는다',
    nourishing: '온양 중 · {minutes}분 남음',
    charmCount: '부적 {count}장',
  },

  settings: {
    arenaTitle: '연무장',
    arenaBlurb:
      '직접 법맥을 짜서 목인을 친다. 목인은 움직이지도 반격하지도 않고, 쓰러져도 다시 선다. 시간 제한도 없어서 멈출 때까지 계속된다. 수위는 전혀 늘지 않는다.',
    arenaRings:
      '목인은 세 겹으로 선다(150 / 290 / 430 픽셀). 더 이상 쓰러지지 않는 고리가 그 법맥의 사거리다. 슬라임을 끌면 자리를 옮길 수 있다(장기는 걸어야 자국이 남는다). 슬라이더는 바로 반영된다.',
    start: '시작',
    stop: '끝내기',
    combosLabel: '합',
    triadLabel: '삼합',
    noCombo: '이것들은 서로 맞지 않는다.',
    listItem: '{name} ({blurb})',
    listSep: ', ',
    listColon: ': ',
    languageTitle: '언어',
    languageBlurb: '기본은 시스템을 따른다. 바꾸면 두 창에 바로 적용된다.',
    languageAuto: '(지금은 시스템을 따르는 중)',
    quitLabel: 'Slime 종료',

    rebirthTitle: '환생',
    rebirthBlurb:
      '여덟 경지를 연기부터 다시 걷는다. 비승 횟수, 산출 배율, 하루 연화 단계는 그대로 남고, 몸에 걸친 노을빛도 흩어지지 않는다.',
    rebirthButton: '환생하여 다시',
    rebirthConfirm: '확실한가? 한 번 더',
    rebirthWarn: '지금의 경지와 층, 수위가 모두 0이 된다. 되돌릴 수 없다.',
    rebirthState: '{realm} · 비승 {times}회 · 산출 ×{rate}',

    quietTitle: '정수',
    quietLabel: '폐관',
    quietBlurb:
      '슬라임이 키보드를 읽지 않고, 무엇에도 반응하지 않는다. 느리게 수련만 이어가며, 네가 돌아올 때까지 한마디도 하지 않는다.',
    quietNote:
      '걸러내는 것이 아니다. 켜져 있는 동안 Windows에 Slime으로 키 입력을 보내지 말라고 전한다.',

    behaviourTitle: '습성',
    behaviourDrag:
      '끌어서 옮기거나 던질 수 있다. 누르면 찌르는 것이고, 오른쪽 버튼으로 이 창이 열린다. 내버려 두면 잠들고, 손을 뻗으면 깬다.',
    behaviourKeys:
      'Windows에서는 네가 친 키도 먹는다. 몇 초마다 옆에 하나 나타나면 뛰어가 삼키고, 그때마다 조금씩 강해진다. 그 글자는 실제로 누른 것이며, 최근 몇 초에서 무작위로, 순서를 흐트러뜨려 고른다.',
    behaviourEat:
      '창 위에서 이 초 동안 가만히 누르고 있으면 그 창을 먹는다. 몸이 다 감싸기 전에 떼면 식사는 취소된다.',
    behaviourQuit:
      'Ctrl+Alt+Shift+Q 는 어디서든 종료한다. 오버레이가 멈춰 있어도.',
  },
};
