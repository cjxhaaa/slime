/**
 * 简体中文 — the source text.
 *
 * This is the one that was written first and that everything else is translated *from*, so where
 * the four others disagree with it about what something means, this is right and they are wrong.
 */
import type { Dictionary } from './types.js';

export const zhHans: Dictionary = {
  realms: ['练气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘'],
  ascended: '已飞升',
  stages: ['一', '二', '三', '四', '五', '六', '七', '八', '九'],
  realmStage: '{realm}{stage}层',
  fullness: ['修为初凝', '修为渐盈', '修为将满', '可突破'],

  breeds: {
    drift: '游魂',
    dart: '奔煞',
    weave: '缠魂',
    split: '裂魄',
    heavy: '重煞',
    root: '钉煞',
  },

  finds: [
    '拾得下品灵石三枚',
    '偶得残卷一页',
    '石缝里挖出半截灵根',
    '檐下接了一捧晨露',
    '风里飘来一缕香火',
    '啃到一块带灵气的旧木',
    '墙角冒出一朵灵芝',
    '捡了枚不知谁掉的玉简',
    '晒了半晌的太阳',
    '误食一颗野果，竟有药性',
    '听了半段路过的道音',
    '雨后水洼里照见星象',
    '在键盘缝里摸到一粒丹砂',
    '接住一片落下的桃花',
    '睡着时吞了口月华',
    '蹭到一线过路的剑气',
    '旧书堆里翻出一张符纸',
    '喝了口忘了倒的凉茶',
    '窗台上收了一把清风',
    '打了个嗝，竟吐出灵光',
  ],

  feats: {
    ascend: { name: '飞升', blurb: '走到了八境的尽头' },
    reborn: { name: '转生', blurb: '重历八境，从练气起' },
    thrice: { name: '三世', blurb: '飞升过三回' },
    ordealFailed: { name: '渡劫未成', blurb: '符箓尽散，修为有损' },
    trialFirst: { name: '初入历练', blurb: '第一次进去' },
    trialSurvived: { name: '历练已成', blurb: '击倒首领，过了一关' },
    trialUnhurt: { name: '毫发无伤', blurb: '过一关，护体一分未失' },
    trialSlayer: { name: '除邪三百', blurb: '一局之内除邪三百' },
    fullSet: { name: '三式俱全', blurb: '三个五行格全满' },
    devour: { name: '吞窗', blurb: '吞掉了一个窗口' },
    fortune: { name: '机缘', blurb: '遇上一次机缘' },
    lieLow: { name: '敛息', blurb: '为别的东西让过一次位' },
  },
  featRealm: '首次抵达{realm}',

  pet: {
    readyToBreak: '{stage} · 可突破\n点击渡劫',
    ordealSure: '渡劫无虞',
    ordealSteady: '渡劫稳妥 · 再攒 {short} 张无虞',
    ordealFair: '渡劫可试 · 再攒 {short} 张无虞',
    ordealPerilous: '渡劫凶险 · 再攒 {short} 张无虞',
    refineLeft: '今日尚可炼化 {left} 次',
    ordealFailed: '渡劫未成\n符箓尽散 · 修为有损',
    featEarned: '得 · {feat}',
    ascendedIdle: '此身已证大道\n设置中可转生重历',
    firstBreath: '此物似有灵性\n正吞吐天地之气',
  },

  menu: {
    settings: '设置…',
    enterTrial: '入历练',
    leaveTrial: '结束历练',
    lockedUntil: '筑基可开',
  },

  elements: {
    金: '金',
    木: '木',
    水: '水',
    火: '火',
    土: '土',
  },

  arms: {
    刀: { name: '刀', blurb: '就地斩出数道刀气' },
    剑: { name: '剑', blurb: '飞剑自去追敌，追上便连斩' },
    盾: { name: '盾', blurb: '罡气绕身，所过者伤' },
    弓: { name: '弓', blurb: '一箭穿出，去势不改' },
    符: { name: '符箓', blurb: '符自寻敌，不中不止' },
  },

  ways: {
    金锐: { name: '锐金', blurb: '穿身而过，不为一人停' },
    金鸣: { name: '鸣金', blurb: '一击荡开四方' },
    木缠: { name: '缠木', blurb: '中者生根，一瞬动不得' },
    木荣: { name: '荣木', blurb: '每中一下，护体回一分' },
    水寒: { name: '寒水', blurb: '落处成寒，过者迟滞' },
    水流: { name: '流水', blurb: '一击连环，自去寻下一个' },
    火燎: { name: '燎火', blurb: '中者带火，烧上一阵' },
    火爆: { name: '爆火', blurb: '落处炸开，近旁俱伤' },
    土崩: { name: '崩土', blurb: '落处地裂，石柱冲起' },
    土固: { name: '固土', blurb: '身披石甲，挨打不损' },
  },

  kit: {
    arm: '兵器',
    way: '五行',
  },

  loadout: {
    title: '此关带什么',
    arms: '兵器 · 选二',
    ways: '五行 · 选三',
    start: '开打',
  },
  bar: {
    silver: '银 {silver}',
    buy: '买 {price}',
  },

  trial: {
    pauseTitle: '停手',
    pauseNote: '现在走，这一趟不算数。',
    pauseResume: '接着打',
    pauseLeave: '不打了',
    cleared: '第 {level} 关已过\n除邪 {kills} · 修为大进',
    overwhelmed: '护体尽碎 · 第 {level} 关第 {wave} 波\n除邪 {kills} · 修为略进',
    arena: '演武已毕\n中桩 {kills} · 修为无增',
    nourishing: '温养中 · 还余 {minutes} 分钟',
    charmCount: '符箓 {count} 张',
    yardOutput: '输出',
    yardRate: '{rate} 次/秒',
    yardTotal: '共 {hits} 次 · {seconds} 秒',
  },

  settings: {
    arenaTitle: '演武场',
    yardTally: '{have} / {all}',
    yardDepth: '深浅',
    start: '上桩',
    stop: '结束',
    combosLabel: '合',
    triadLabel: '三合',
    noCombo: '这几个不相合。',
    listItem: '{name}（{blurb}）',
    listSep: '、',
    listColon: '：',
    languageTitle: '语言',
    languageAuto: '（当前跟随系统）',
    quitLabel: '退出 Slime',

    rebirthTitle: '转生',
    rebirthButton: '转生重历',
    rebirthConfirm: '确定？再点一次',
    rebirthWarn: '当前境界、层数与修为会清零，无法撤销。',
    rebirthState: '{realm} · 已飞升 {times} 次 · 产出 ×{rate}',

    quietTitle: '静修',
    quietLabel: '闭关',
    quietNote: '平时它读按键，只为挑一个掉在身边的字。开着时 Windows 不再把按键送给它。',

    lieLowTitle: '敛息',
    lieLowLabel: '满屏时自己退下',
    lieLowUnsupported: '这个系统判断不了，用不了。',

    featsTitle: '见闻',
    featsLocked: '未历',
    featsCount: '已得 {done} / {all}',
  },
};
