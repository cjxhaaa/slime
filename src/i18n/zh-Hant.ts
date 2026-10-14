/**
 * 繁體中文.
 *
 * Mostly the same words in traditional forms, and the temptation is to run the whole file through a
 * converter. A few places where that would be wrong, and they are the reason this is written by
 * hand:
 *
 * - 「符籙」, not 「符箓」. 箓 is a simplified form that a traditional reader would not write.
 * - 「歷練」 and 「曆」 are different characters that both simplify to 历; the one here is 歷.
 * - 「一符一敵」 keeps 敵; 「來者遲」 keeps 來/遲 — trivial, but a converter set to the wrong table
 *   produces 「來者遟」 and similar near-misses.
 * - 「幹」 vs 「乾」 vs 「干」 does not arise here, and that is luck rather than design; it is the
 *   classic case where one-to-many conversion goes wrong silently.
 */
import type { Dictionary } from './types.js';

export const zhHant: Dictionary = {
  realms: ['練氣', '築基', '金丹', '元嬰', '化神', '煉虛', '合體', '大乘'],
  ascended: '已飛昇',
  stages: ['一', '二', '三', '四', '五', '六', '七', '八', '九'],
  realmStage: '{realm}{stage}層',
  fullness: ['修為初凝', '修為漸盈', '修為將滿', '可突破'],

  breeds: {
    drift: '遊魂',
    dart: '奔煞',
    weave: '纏魂',
    split: '裂魄',
    heavy: '重煞',
    root: '釘煞',
  },

  finds: [
    '拾得下品靈石三枚',
    '偶得殘卷一頁',
    '石縫裡挖出半截靈根',
    '簷下接了一捧晨露',
    '風裡飄來一縷香火',
    '啃到一塊帶靈氣的舊木',
    '牆角冒出一朵靈芝',
    '撿了枚不知誰掉的玉簡',
    '曬了半晌的太陽',
    '誤食一顆野果，竟有藥性',
    '聽了半段路過的道音',
    '雨後水窪裡照見星象',
    '在鍵盤縫裡摸到一粒丹砂',
    '接住一片落下的桃花',
    '睡著時吞了口月華',
    '蹭到一線過路的劍氣',
    '舊書堆裡翻出一張符紙',
    '喝了口忘了倒的涼茶',
    '窗臺上收了一把清風',
    '打了個嗝，竟吐出靈光',
  ],

  feats: {
    ascend: { name: '飛昇', blurb: '走到了八境的盡頭' },
    reborn: { name: '轉生', blurb: '重歷八境，從練氣起' },
    thrice: { name: '三世', blurb: '飛昇過三回' },
    ordealFailed: { name: '渡劫未成', blurb: '符籙盡散，修為有損' },
    trialFirst: { name: '初入歷練', blurb: '第一次進去' },
    trialSurvived: { name: '歷練已成', blurb: '擊倒首領，過了一關' },
    trialUnhurt: { name: '毫髮無傷', blurb: '過一關，護體一分未失' },
    trialSlayer: { name: '除邪三百', blurb: '一局之內除邪三百' },
    fullSet: { name: '三式俱全', blurb: '三個五行格全滿' },
    devour: { name: '吞窗', blurb: '吞掉了一個視窗' },
    fortune: { name: '機緣', blurb: '遇上一次機緣' },
    lieLow: { name: '斂息', blurb: '為別的東西讓過一次位' },
  },
  featRealm: '首次抵達{realm}',

  pet: {
    readyToBreak: '{stage} · 可突破\n點擊渡劫',
    ordealSure: '渡劫無虞',
    ordealSteady: '渡劫穩妥 · 再攢 {short} 張無虞',
    ordealFair: '渡劫可試 · 再攢 {short} 張無虞',
    ordealPerilous: '渡劫凶險 · 再攢 {short} 張無虞',
    refineLeft: '今日尚可煉化 {left} 次',
    ordealFailed: '渡劫未成\n符籙盡散 · 修為有損',
    featEarned: '得 · {feat}',
    ascendedIdle: '此身已證大道\n設定中可轉生重歷',
    firstBreath: '此物似有靈性\n正吞吐天地之氣',
  },

  menu: {
    settings: '設定…',
    enterTrial: '入歷練',
    leaveTrial: '結束歷練',
    lockedUntil: '築基可開',
  },

  elements: {
    金: '金',
    木: '木',
    水: '水',
    火: '火',
    土: '土',
  },

  arms: {
    刀: { name: '刀', blurb: '就地斬出數道刀氣' },
    剑: { name: '劍', blurb: '飛劍自去追敵，追上便連斬' },
    盾: { name: '盾', blurb: '罡氣繞身，所過者傷' },
    弓: { name: '弓', blurb: '一箭穿出，去勢不改' },
    符: { name: '符籙', blurb: '符自尋敵，不中不止' },
  },

  ways: {
    金锐: { name: '銳金', blurb: '穿身而過，不為一人停' },
    金鸣: { name: '鳴金', blurb: '一擊盪開四方' },
    木缠: { name: '纏木', blurb: '中者生根，一瞬動不得' },
    木荣: { name: '榮木', blurb: '每中一下，護體回一分' },
    水寒: { name: '寒水', blurb: '落處成寒，過者遲滯' },
    水流: { name: '流水', blurb: '一擊連環，自去尋下一個' },
    火燎: { name: '燎火', blurb: '中者帶火，燒上一陣' },
    火爆: { name: '爆火', blurb: '落處炸開，近旁俱傷' },
    土崩: { name: '崩土', blurb: '落處地裂，石柱沖起' },
    土固: { name: '固土', blurb: '身披石甲，挨打不損' },
  },

  kit: {
    arm: '兵器',
    way: '五行',
  },

  loadout: {
    title: '此關帶什麼',
    arms: '兵器 · 選二',
    ways: '五行 · 選三',
    start: '開打',
  },
  bar: {
    silver: '銀 {silver}',
    buy: '買 {price}',
  },

  trial: {
    pauseTitle: '停手',
    pauseNote: '現在走，這一趟不算數。',
    pauseResume: '接著打',
    pauseLeave: '不打了',
    cleared: '第 {level} 關已過\n除邪 {kills} · 修為大進',
    overwhelmed: '護體盡碎 · 第 {level} 關第 {wave} 波\n除邪 {kills} · 修為略進',
    arena: '演武已畢\n中樁 {kills} · 修為無增',
    nourishing: '溫養中 · 還餘 {minutes} 分鐘',
    charmCount: '符籙 {count} 張',
    yardOutput: '輸出',
    yardRate: '{rate} 次/秒',
    yardTotal: '共 {hits} 次 · {seconds} 秒',
  },

  settings: {
    arenaTitle: '演武場',
    yardTally: '{have} / {all}',
    yardDepth: '深淺',
    start: '上樁',
    stop: '結束',
    combosLabel: '合',
    triadLabel: '三合',
    noCombo: '這幾個不相合。',
    listItem: '{name}（{blurb}）',
    listSep: '、',
    listColon: '：',
    languageTitle: '語言',
    languageAuto: '（目前跟隨系統）',
    quitLabel: '退出 Slime',

    rebirthTitle: '轉生',
    rebirthButton: '轉生重歷',
    rebirthConfirm: '確定？再點一次',
    rebirthWarn: '目前境界、層數與修為會清零，無法復原。',
    rebirthState: '{realm} · 已飛昇 {times} 次 · 產出 ×{rate}',

    quietTitle: '靜修',
    quietLabel: '閉關',
    quietNote: '平時牠讀按鍵，只為挑一個掉在身邊的字。開著時 Windows 不再把按鍵送給牠。',

    lieLowTitle: '斂息',
    lieLowLabel: '滿螢幕時自己退下',
    lieLowUnsupported: '這個系統判斷不了，用不了。',

    featsTitle: '見聞',
    featsLocked: '未歷',
    featsCount: '已得 {done} / {all}',
  },
};
