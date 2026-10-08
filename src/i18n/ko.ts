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
  fullness: ['공력 응결', '공력 점증', '돌파 임박', '돌파 가능'],

  schools: {
    符: { name: '부적', blurb: '부적을 던져, 한 장에 적 하나' },
    剑: { name: '검기', blurb: '한 줄기를 베어 보내 지나는 길을 끊는다' },
    雷: { name: '뇌법', blurb: '벼락을 내리고 가까운 쪽으로 옮겨붙는다' },
    火: { name: '단화', blurb: '떨어진 자리에서 타오른다' },
    冰: { name: '빙백', blurb: '몸 둘레는 한기, 들어온 것은 느려진다' },
    风: { name: '풍인', blurb: '몸을 두르고 돈다' },
    土: { name: '산악', blurb: '맞아도 상하지 않고, 깨질 때 밀어낸다' },
    毒: { name: '독무', blurb: '지나간 자리가 독무가 된다' },
    影: { name: '영위', blurb: '그림자 하나가 스스로 싸운다' },
  },

  combos: {
    符雷: { name: '뇌부', blurb: '부적이 닿은 자리에서 한 줄기가 갈라져 가까운 적을 친다' },
    符剑: { name: '부적검', blurb: '부적이 세 호흡 몸을 돌고 나서 날아간다' },
    符土: { name: '부적진', blurb: '부적이 날지 않고 땅에 진을 이룬다' },
    符影: { name: '괴뢰부', blurb: '영위도 부적을 던진다' },
    剑风: { name: '풍검', blurb: '사방으로 한 줄기씩' },
    剑雷: { name: '뇌검', blurb: '벨 때마다 곁으로 벼락이 떨어진다' },
    雷火: { name: '뇌화', blurb: '땅의 불이 가까운 곳으로 벼락을 부른다' },
    火冰: { name: '빙화', blurb: '한기 속에서 불붙은 적은 터진다' },
    火毒: { name: '독화', blurb: '독무에 불이 붙어 넓게 번지며 타오른다' },
    冰风: { name: '풍설', blurb: '풍인이 서리 자국을 끌고, 그 자국도 벤다' },
    冰土: { name: '현빙갑', blurb: '껍질이 깨져도 스스로 다시 언다' },
    风毒: { name: '풍독', blurb: '독무가 더 넓게 흩어지고 떠다닌다' },
    土影: { name: '유양', blurb: '껍질이 깨질 때 땅에서 영위 둘이 솟는다' },
    毒影: { name: '영독', blurb: '영위는 일격마다 독무가 실린다' },
  },

  triads: {
    符剑雷: { name: '천지인검진', blurb: '부적이 땅에 진을 이루고 벼락이 그 위로 떨어지며 검기가 진을 따라 돈다' },
    符土影: { name: '황천인', blurb: '껍질이 깨질 때 땅에 부적진이 떠오르고 영위 셋이 걸어 나온다' },
    雷火冰: { name: '삼재겁', blurb: '땅의 불이 떨어진 자리에 벼락이 내리고 찬 서리가 둥글게 터진다' },
    冰风土: { name: '한상벽', blurb: '풍인이 몸을 떠나 한기의 가장자리에 박혀 도는 얼음벽이 된다' },
    风剑毒: { name: '독풍인', blurb: '검기가 독무를 두르고 날아 지나간 자리에 독무를 남긴다' },
    毒火影: { name: '업화귀', blurb: '영위가 온몸으로 타오르며 지나간 자리에 불이 번진다' },
    土冰影: { name: '현음갑', blurb: '영위가 더 이상 떠돌지 않고 갑옷을 따라 곁을 돌며 지킨다' },
  },

  evolutions: {
    符: { name: '만부조원', blurb: '숨마다 한 장, 결코 빗나가지 않는다' },
    剑: { name: '만검귀종', blurb: '베어 보내는 것은 한 줄기가 아니라 한 무리' },
    雷: { name: '구천뇌정', blurb: '벼락이 적을 따라 끝까지 번져 간다' },
    火: { name: '분천로', blurb: '불이 꺼지지 않고, 게다가 따라온다' },
    冰: { name: '현빙옥', blurb: '한기 안에서는 걷는 것이 멈춘다' },
    风: { name: '강풍진', blurb: '세 겹의 풍인이 서로 반대로 돈다' },
    土: { name: '부동명산', blurb: '껍질은 더 이상 깨지지 않고 밀어낼 뿐' },
    毒: { name: '만독고', blurb: '독무가 적을 쫓아간다' },
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
    '해진 비급 한 쪽을 우연히 얻었다',
    '돌 틈에서 영근 반 토막을 캐냈다',
    '처마 밑에서 아침이슬을 한 움큼 받았다',
    '바람결에 향 냄새가 한 가닥 실려 왔다',
    '영기가 남은 낡은 나무를 갉았다',
    '벽 모퉁이에 영지가 하나 돋았다',
    '누가 흘렸는지 모를 옥간 하나를 주웠다',
    '한나절 햇볕을 쬐었다',
    '들열매를 잘못 먹었는데 약이 되었다',
    '지나가는 도가 한 자락을 반쯤 들었다',
    '비 갠 뒤 웅덩이에 별자리가 비쳤다',
    '키보드 틈에서 단사 한 알을 집어냈다',
    '떨어지는 복사꽃 한 장을 받았다',
    '자는 사이에 달빛을 한 모금 삼켰다',
    '지나가던 검기 한 줄기를 스쳤다',
    '헌책 더미에서 부적 한 장이 나왔다',
    '버리는 걸 잊은 식은 차를 마셨다',
    '창턱에서 맑은 바람을 한 줌 거두었다',
    '트림을 했더니 서광이 뿜어져 나왔다',
  ],

  feats: {
    ascend: { name: '비승', blurb: '여덟 경지의 끝까지 걸었다' },
    reborn: { name: '환생', blurb: '여덟 경지를 연기부터 다시 걷기 시작했다' },
    thrice: { name: '세 번째 삶', blurb: '세 번 비승했다' },
    ordealFailed: { name: '도겁 실패', blurb: '부적이 모두 흩어지고 공력을 잃었다' },
    trialFirst: { name: '첫 시련', blurb: '처음으로 들어갔다' },
    trialSurvived: { name: '시련을 마침', blurb: '한 판을 끝까지 버텼다' },
    trialUnhurt: { name: '상처 없이', blurb: '호체가 한 번도 닿지 않은 채로 한 판을 끝냈다' },
    trialSlayer: { name: '퇴마 삼백', blurb: '한 판에서 삼백을 물리쳤다' },
    pair: { name: '합', blurb: '두 법맥을 짝지었다' },
    triad: { name: '삼합', blurb: '세 법맥을 짝지었다' },
    evolve: { name: '진화', blurb: '큰 것을 뽑았다' },
    fullSet: { name: '네 법맥', blurb: '네 칸을 모두 채웠다' },
    devour: { name: '창을 삼키다', blurb: '창 하나를 통째로 삼켰다' },
    fortune: { name: '기연', blurb: '무언가와 마주쳤다' },
    lieLow: { name: '은신', blurb: '한 번, 다른 것을 위해 물러났다' },
  },
  featRealm: '처음 {realm}에 닿았다',

  pet: {
    readyToBreak: '{stage} · 돌파 가능\n눌러서 도겁',
    ordealSure: '도겁에 근심이 없다',
    ordealSteady: '도겁이 무난하다 · {short}장 더 모으면 근심이 없다',
    ordealFair: '도겁을 시도할 만하다 · {short}장 더 모으면 근심이 없다',
    ordealPerilous: '도겁이 위험하다 · {short}장 더 모으면 근심이 없다',
    refineLeft: '오늘은 {left}번 더 연화할 수 있다',
    ordealFailed: '도겁에 실패했다\n부적이 모두 흩어지고 · 공력이 상했다',
    featEarned: '얻음 · {feat}',
    ascendedIdle: '이 몸은 이미 대도를 이루었다\n설정에서 환생하여 다시 걸을 수 있다',
    firstBreath: '이것에 영성이 있는 듯\n천지의 기를 삼키고 뱉는다',
  },

  menu: {
    settings: '설정…',
    enterTrial: '시련에 들기',
    leaveTrial: '시련 끝내기',
    lockedUntil: '축기부터',
  },

  draft: {
    choose: '하나 고르기',
    newSchool: '새 술법',
    raise: '정진',
    evolve: '★ 진화',
    mend: '운기조식',
    mendTitle: '호체',
    mendBlurb: '호체 셋 회복',
    levelStep: '{from}중 → {to}중',
    pairsWith: '{school} 합 · {combo}',
    triadWith: '삼합 · {triad}',
  },

  trial: {
    survived: '시련을 마쳤다\n퇴마 {kills} · 공력이 크게 늘었다',
    overwhelmed: '호체가 다 깨졌다\n퇴마 {kills} · 공력이 조금 늘었다',
    arena: '연무를 마쳤다\n명중 {kills} · 공력은 늘지 않았다',
    nourishing: '온양 중 · {minutes}분 남음',
    charmCount: '부적 {count}장',
  },

  settings: {
    arenaTitle: '연무장',
    arenaBlurb: '직접 법맥을 짜서 목인을 친다. 목인은 반격하지 않고, 쓰러져도 다시 선다. 멈출 때까지 계속되며 공력은 늘지 않는다.',
    arenaRings:
      '목인은 세 고리로 늘어선다. 더 이상 쓰러지지 않는 고리가 이 법맥이 닿는 거리다. 슬라임은 끌어서 옮긴다. 독무는 걸어야 자국이 남는다. 슬라이더는 바로 적용된다.',
    start: '시작',
    stop: '끝내기',
    combosLabel: '합',
    triadLabel: '삼합',
    noCombo: '이것들은 서로 맞지 않는다.',
    listItem: '{name} ({blurb})',
    listSep: ', ',
    listColon: ': ',
    languageTitle: '언어',
    languageBlurb: '기본은 시스템을 따른다. 바꾸면 두 창이 함께 바뀐다.',
    languageAuto: '(지금은 시스템을 따르는 중)',
    quitLabel: 'Slime 종료',

    rebirthTitle: '환생',
    rebirthBlurb: '연기부터 여덟 경지를 다시 걷는다. 비승 횟수, 산출 배율, 하루 연화 단계는 그대로 남고 노을빛도 사라지지 않는다.',
    rebirthButton: '환생하여 다시 걷기',
    rebirthConfirm: '확실한가? 한 번 더',
    rebirthWarn: '지금의 경지와 층, 공력이 모두 0이 된다. 되돌릴 수 없다.',
    rebirthState: '{realm} · 비승 {times}회 · 산출 ×{rate}',

    quietTitle: '정좌',
    quietLabel: '폐관',
    quietBlurb: '키보드를 읽지 않고 무엇에도 반응하지 않는다. 수련은 그대로 이어가되 조용해진다.',
    quietNote: '켜져 있는 동안 Windows가 Slime에 키 입력을 보내지 않는다. 걸러내는 것이 아니라 아예 받지 않는다.',

    lieLowTitle: '은신',
    lieLowLabel: '전체 화면일 때 물러나기',
    lieLowBlurb: '게임이나 영상, 발표가 화면 전체를 차지한 동안 숨었다가 바탕 화면으로 돌아오면 나온다. 창을 최대화한 것은 해당하지 않는다.',
    lieLowUnsupported: '이 시스템에서는 판별할 수 없어 사용할 수 없다.',

    featsTitle: '견문',
    featsBlurb: '이 슬라임이 해온 일들. 기록일 뿐 아무것도 주지 않는다.',
    featsLocked: '아직',
    featsCount: '{all} 중 {done}',

    behaviourTitle: '습성',
    behaviourDrag: '끌어서 옮기거나 던질 수 있다. 누르면 찌른다. 오른쪽 버튼으로 이 창이 열린다. 내버려 두면 자고, 손을 뻗으면 깬다.',
    behaviourKeys:
      'Windows에서는 네가 친 키도 먹는다. 옆에 글자가 나타나면 뛰어가 삼키고 조금 강해진다. 그 글자는 네가 실제로 누른 것이며, 무작위로 골라 순서를 흐트러뜨린 것이다.',
    behaviourEat: '창 위에서 가만히 누르고 있으면 그 창을 먹는다. 다 감싸기 전에 떼면 식사는 취소된다.',
    behaviourQuit: 'Ctrl+Alt+Shift+Q는 어디서든 종료한다. 오버레이가 멈춰 있어도 작동한다.',
  },
};
