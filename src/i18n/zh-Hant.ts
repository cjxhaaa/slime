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

  creatures: {
    goblin: ['哥布林', '精英哥布林', '哥布林王'],
    zombie: ['喪屍', '精英喪屍', '喪屍王'],
    spider: ['蜘蛛', '精英蜘蛛', '蜘蛛皇后'],
    boar: ['野豬', '精英野豬', '野豬王'],
    bat: ['小蝙蝠', '蝙蝠精英', '蝙蝠王'],
    drake: ['小惡龍', '精英惡龍', '惡龍王'],
    gunner: ['炮手哥布林', '精英炮手哥布林', '炮手哥布林王'],
    mage: ['法師', '精英法師', '法師王'],
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

  codex: {
    mergeHow: [
      '把一件道具拖到另一件同品階的道具上即可合成；也可以先點一件，再點另一件。',
      '兩件相同的道具：合成同一種道具，品階 +1。',
      '兩件不同的道具：從本局選定的五種道具中隨機得到一種，品階 +1。',
      '品階越高效果越強，最高 6 階。把滑鼠移到道具上，可以查看它每一階的數值。',
    ],
    grade: '{n} 階',
    armsNote: '同一種兵器帶了多件時，每件各自出手。一次傷害超過敵人剩餘血量時，多出的部分會分給 {spill} 範圍內的其他敵人。',
    waysNote: '五行對所有兵器的每次命中生效。同一種五行帶了多件時效果疊加：兩件 1 階約等於一件 1.6 階。',
    hoverHint: '裝備欄裡的道具按品階顯示顏色',
    seconds: '{v} 秒',
    stat: {
      damage: '傷害',
      every: '間隔',
      blades: '刀氣數',
      swords: '飛劍數',
      nodes: '罡氣數',
      ring: '環繞半徑',
      pierce: '額外穿透',
      knock: '震退範圍',
      hold: '定身',
      heal: '回 1 點需',
      patch: '寒地半徑',
      jump: '彈射距離',
      burn: '燃燒時長',
      blast: '爆炸半徑',
      targets: '最多目標',
      rings: '石柱圈數',
      reach: '範圍',
      layers: '石甲層數',
    },
    arms: {
      刀: '每 {every} 秒朝最近的敵人扇形揮出 {blades} 道刀氣。刀氣向前飛行約 {travel} 距離，每道最多切中 {bite} 個敵人。',
      剑: '放出 {swords} 把飛劍，自動追擊敵人，追上後連砍 {flurry} 下。飛劍不會消失，會一直尋找下一個目標。',
      盾: '{nodes} 團罡氣繞著身體旋轉（半徑 {ring}），碰到敵人就造成傷害，每團命中後停 {cool} 秒。',
      弓: '每 {every} 秒向 {range} 範圍內最近的敵人射出一箭，命中一個敵人後消失。',
      符: '每 {every} 秒放出一張符籙，自動追蹤敵人，最多飛行 {life} 秒，命中一個敵人後消失。',
    },
    ways: {
      金锐: '弓箭、刀氣和符籙命中後不會消失，還能再穿透 {pierce} 個敵人。對飛劍和罡氣無效。',
      金鸣: '每次命中，把 {reach} 範圍內的敵人向外震退。',
      木缠: '每次命中，讓 {reach} 範圍內的敵人定身 {hold} 秒。',
      木荣: '每次命中都會回復護體，最多每 {per} 秒回復 1 點。（被敵人碰到一次扣 1 點護體）',
      水寒: '命中處結出半徑 {patch} 的寒地，持續 {last} 秒，敵人在寒地裡移動速度降低 {slow}%。',
      水流: '每次命中後，彈射到 {jump} 範圍內最近的另一個敵人，造成 1 點傷害。',
      火燎: '命中處附近的敵人著火 {burn} 秒，每 {beat} 秒受到 1 點傷害。',
      火爆: '命中處發生爆炸，對半徑 {blast} 內最多 {targets} 個敵人造成 1 點傷害。',
      土崩: '命中處地面裂開，{rings} 圈石柱向外衝起（範圍 {reach}），每根石柱造成 1 點傷害。',
      土固: '身披 {layers} 層石甲，每層擋下一次敵人的碰撞。石甲全碎時震退 {shove} 範圍內的敵人，{back} 秒後重新長出。',
    },
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
    level: '第 {level} 關',
    capped: '{realm}能闖的最後一關',
  },
  bar: {
    silver: '銀 {silver}',
    buy: '買 {price}',
    found: '+{silver} 銀',
  },

  trial: {
    pauseTitle: '停手',
    pauseNote: '現在走，這一趟不算數。',
    pauseResume: '接著打',
    pauseLeave: '不打了',
    cleared: '第 {level} 關已過\n除邪 {kills} · 修為大進',
    overwhelmed: '護體盡碎 · 第 {level} 關第 {wave} 波\n除邪 {kills} · 修為略進',
    capReached: '{realm}只能闖到這裡 · 突破到{next}可再往上',
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
    generalTitle: '起居',
    abodeTitle: '洞府',
    skinWorn: '著',
    codexTitle: '圖鑑',
    codexGrades: '品階',
    languageAuto: '（目前跟隨系統）',
    quitLabel: '退出 Slime',
    skinTitle: '形象',
    skinClassic: '史萊姆',
    skinNote: '換形象不影響修為和動作。自製形象放進形象資料夾，每個形象一個子資料夾。',
    skinFolder: '打開形象資料夾',
    skinRescan: '重新掃描',
    skinBroken: '無法使用 {name}：{error}',
    skinBy: '作者：{author}',

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
