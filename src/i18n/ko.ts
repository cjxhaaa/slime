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

  creatures: {
    goblin: ['고블린', '정예 고블린', '고블린 왕'],
    zombie: ['좀비', '정예 좀비', '좀비 왕'],
    spider: ['거미', '정예 거미', '거미 여왕'],
    boar: ['멧돼지', '정예 멧돼지', '멧돼지 왕'],
    bat: ['꼬마 박쥐', '정예 박쥐', '박쥐 왕'],
    drake: ['꼬마 악룡', '정예 악룡', '악룡 왕'],
    gunner: ['포수 고블린', '정예 포수 고블린', '포수 고블린 왕'],
    mage: ['마법사', '정예 마법사', '마법사 왕'],
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
    trialSurvived: { name: '시련을 마침', blurb: '우두머리를 쓰러뜨리고 한 관을 넘었다' },
    trialUnhurt: { name: '상처 없이', blurb: '호체가 한 번도 닿지 않은 채로 한 관을 넘었다' },
    trialSlayer: { name: '퇴마 삼백', blurb: '한 판에서 삼백을 물리쳤다' },
    fullSet: { name: '삼식구전', blurb: '오행 칸이 모두 찼다' },
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

  elements: {
    金: '금',
    木: '목',
    水: '수',
    火: '화',
    土: '토',
  },

  arms: {
    刀: { name: '도', blurb: '그 자리에서 여러 줄기 칼기를 베어 낸다' },
    剑: { name: '검', blurb: '비검이 스스로 적을 쫓아가, 닿으면 연달아 벤다' },
    盾: { name: '방패', blurb: '강기가 몸을 돌며 스치는 것을 상하게 한다' },
    弓: { name: '활', blurb: '화살 한 대가 곧게 나아가며 방향을 바꾸지 않는다' },
    符: { name: '부적', blurb: '부적이 스스로 적을 찾아가 맞출 때까지 멈추지 않는다' },
  },

  ways: {
    金锐: { name: '예금', blurb: '몸을 꿰뚫고 나아가며 한 사람을 위해 멈추지 않는다' },
    金鸣: { name: '명금', blurb: '한 번 치면 사방으로 튕겨 낸다' },
    木缠: { name: '전목', blurb: '맞은 것은 뿌리를 내려 한순간 움직이지 못한다' },
    木荣: { name: '영목', blurb: '한 번 맞출 때마다 호체가 조금 돌아온다' },
    水寒: { name: '한수', blurb: '떨어진 자리가 차가워져 지나는 것이 느려진다' },
    水流: { name: '유수', blurb: '한 번의 타격이 이어져 스스로 다음을 찾는다' },
    火燎: { name: '요화', blurb: '맞은 것은 불이 붙어 한참을 탄다' },
    火爆: { name: '폭화', blurb: '떨어진 자리에서 터져 가까운 것을 함께 상하게 한다' },
    土崩: { name: '붕토', blurb: '떨어진 자리에서 땅이 갈라지고 돌기둥이 솟는다' },
    土固: { name: '고토', blurb: '돌갑옷을 둘러 한 대를 받아 낸다' },
  },

  kit: {
    arm: '병기',
    way: '오행',
  },

  loadout: {
    title: '이번 관에 가져갈 것',
    arms: '병기 · 둘 고르기',
    ways: '오행 · 셋 고르기',
    start: '시작',
  },
  bar: {
    silver: '은 {silver}',
    buy: '사기 {price}',
  },

  trial: {
    pauseTitle: '멈춤',
    pauseNote: '지금 나가면 이번 판은 셈에 들지 않는다.',
    pauseResume: '계속',
    pauseLeave: '나가기',
    cleared: '{level}관을 넘었다\n퇴마 {kills} · 공력이 크게 늘었다',
    overwhelmed: '호체가 다 깨졌다\n{level}관 {wave}번째 물결 · 퇴마 {kills} · 공력이 조금 늘었다',
    arena: '연무를 마쳤다\n명중 {kills} · 공력은 늘지 않았다',
    nourishing: '온양 중 · {minutes}분 남음',
    charmCount: '부적 {count}장',
    yardOutput: '타수',
    yardRate: '초당 {rate}',
    yardTotal: '합 {hits} · {seconds}초',
  },

  settings: {
    arenaTitle: '연무장',
    yardTally: '{have} / {all}',
    yardDepth: '깊이',
    start: '시작',
    stop: '끝내기',
    combosLabel: '합',
    triadLabel: '삼합',
    noCombo: '이것들은 서로 맞지 않는다.',
    listItem: '{name} ({blurb})',
    listSep: ', ',
    listColon: ': ',
    languageTitle: '언어',
    languageAuto: '(지금은 시스템을 따르는 중)',
    quitLabel: 'Slime 종료',

    rebirthTitle: '환생',
    rebirthButton: '환생하여 다시 걷기',
    rebirthConfirm: '확실한가? 한 번 더',
    rebirthWarn: '지금의 경지와 층, 공력이 모두 0이 된다. 되돌릴 수 없다.',
    rebirthState: '{realm} · 비승 {times}회 · 산출 ×{rate}',

    quietTitle: '정좌',
    quietLabel: '폐관',
    quietNote: '평소에는 키 입력을 읽지만 옆에 떨어뜨릴 글자를 고르는 데만 쓴다. 켜 두면 Windows가 그것을 보내지 않는다.',

    lieLowTitle: '은신',
    lieLowLabel: '전체 화면일 때 물러나기',
    lieLowUnsupported: '이 시스템에서는 판별할 수 없어 사용할 수 없다.',

    featsTitle: '견문',
    featsLocked: '아직',
    featsCount: '{all} 중 {done}',
  },
};
