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

  schools: {
    符: { name: '符籙', blurb: '擲符，一符一敵' },
    剑: { name: '劍氣', blurb: '斬出一道，沿途盡斷' },
    雷: { name: '雷法', blurb: '落雷，並及其近者' },
    火: { name: '丹火', blurb: '燃於原地' },
    冰: { name: '冰魄', blurb: '周身寒域，來者遲' },
    风: { name: '風刃', blurb: '繞身而轉' },
    土: { name: '山嶽', blurb: '受擊不損，碎則盪開' },
    毒: { name: '瘴氣', blurb: '所過之處成瘴' },
    影: { name: '影衛', blurb: '一影自戰' },
  },

  combos: {
    符雷: { name: '雷符', blurb: '符落處再分一道，擊其近者' },
    符剑: { name: '符劍', blurb: '符先繞身三息，再飛出' },
    符土: { name: '陣符', blurb: '符不飛了，在地上連成一圈法陣' },
    符影: { name: '傀符', blurb: '影衛也會擲符' },
    剑风: { name: '風劍', blurb: '四方各斬一道' },
    剑雷: { name: '雷劍', blurb: '每一劍都往旁邊引一道雷' },
    雷火: { name: '雷火', blurb: '地火向近處引雷' },
    火冰: { name: '冰火', blurb: '寒域中的敵人被點燃時炸開' },
    火毒: { name: '焚瘴', blurb: '瘴氣會被點著，成片燒起來' },
    冰风: { name: '風雪', blurb: '風刃拖出霜跡，跡上也傷人' },
    冰土: { name: '玄冰甲', blurb: '殼碎後自行重結' },
    风毒: { name: '風毒', blurb: '瘴氣被吹散得更寬，並會飄' },
    土影: { name: '幽壤', blurb: '殼碎時從地裡起兩個影衛' },
    毒影: { name: '影毒', blurb: '影衛的每一擊都帶瘴' },
  },

  triads: {
    符剑雷: { name: '三才劍陣', blurb: '符先落地成陣，雷引其上，劍氣循陣旋出' },
    符土影: { name: '幽都印', blurb: '殼碎時地上升起符陣，陣中走出三個影衛' },
    雷火冰: { name: '三災劫', blurb: '地火落處同時降雷，並炸開一圈寒霜' },
    冰风土: { name: '玄霜壁', blurb: '風刃不再繞身，釘在寒域邊緣結成一道旋轉冰牆' },
    风剑毒: { name: '瘴風刃', blurb: '劍氣裹瘴而行，所過之處留下瘴痕' },
    毒火影: { name: '業火鬼', blurb: '影衛渾身燃燒，所過之處成片引火' },
    土冰影: { name: '玄冥甲', blurb: '影衛不再遊走，護在身側隨甲而轉' },
  },

  evolutions: {
    符: { name: '萬符朝元', blurb: '每息一符，永不落空' },
    剑: { name: '萬劍歸宗', blurb: '斬出的不再是一道，是一片' },
    雷: { name: '九天神雷', blurb: '雷沿著敵人一路傳下去' },
    火: { name: '焚天爐', blurb: '火不熄，且隨身而走' },
    冰: { name: '玄冰獄', blurb: '寒域之內，行者盡止' },
    风: { name: '罡風陣', blurb: '三重風刃，反向而轉' },
    土: { name: '不動明山', blurb: '殼不再碎，只是盪開' },
    毒: { name: '萬毒蠱', blurb: '瘴氣追著敵人走' },
    影: { name: '影衛三重', blurb: '三個影衛' },
  },

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
    trialSurvived: { name: '歷練已成', blurb: '撐滿了一整局' },
    trialUnhurt: { name: '毫髮無傷', blurb: '撐滿一局，護體一分未失' },
    trialSlayer: { name: '除邪三百', blurb: '一局之內除邪三百' },
    pair: { name: '相合', blurb: '湊出一個兩合' },
    triad: { name: '三合', blurb: '湊出一個三合' },
    evolve: { name: '進化', blurb: '抽中一次大獎' },
    fullSet: { name: '四脈俱全', blurb: '四個槽位全滿' },
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

  draft: {
    choose: '擇一',
    newSchool: '新法',
    raise: '精進',
    evolve: '★ 進化',
    mend: '調息',
    mendTitle: '護體',
    mendBlurb: '恢復三分護體',
    levelStep: '{from}重 → {to}重',
    pairsWith: '與{school}合 · {combo}',
    triadWith: '三合 · {triad}',
  },

  trial: {
    survived: '歷練已成\n除邪 {kills} · 修為大進',
    overwhelmed: '護體盡碎\n除邪 {kills} · 修為略進',
    arena: '演武已畢\n中樁 {kills} · 修為無增',
    nourishing: '溫養中 · 還餘 {minutes} 分鐘',
    charmCount: '符籙 {count} 張',
  },

  settings: {
    arenaTitle: '演武場',
    arenaBlurb:
      '自己搭一套法脈，對著木樁打。樁不動、不還手、倒了就站回來，也沒有時間限制，不點結束就一直打。不結算任何修為。',
    arenaRings:
      '樁排成三圈（150 / 290 / 430 像素）——哪一圈不再倒，就是這套法脈的射程邊界。拖曳史萊姆可以換位置（瘴氣需要走起來才留痕）。拉滑桿當場生效。',
    start: '上樁',
    stop: '結束',
    combosLabel: '合',
    triadLabel: '三合',
    noCombo: '這幾個不相合。',
    listItem: '{name}（{blurb}）',
    listSep: '、',
    listColon: '：',
    languageTitle: '語言',
    languageBlurb: '預設跟隨系統。改了立刻生效，兩個視窗一起換。',
    languageAuto: '（目前跟隨系統）',
    quitLabel: '退出 Slime',

    rebirthTitle: '轉生',
    rebirthBlurb:
      '重歷八境，從練氣起。已飛昇的次數、產出倍率和每日煉化檔位都保留，身上的霞光也不會散。',
    rebirthButton: '轉生重歷',
    rebirthConfirm: '確定？再點一次',
    rebirthWarn: '目前境界、層數與修為會清零，無法復原。',
    rebirthState: '{realm} · 已飛昇 {times} 次 · 產出 ×{rate}',

    quietTitle: '靜修',
    quietLabel: '閉關',
    quietBlurb:
      '讓史萊姆不再讀取鍵盤，也不再對任何事有反應。牠仍舊慢慢修煉，在你回來之前一句話也不說。',
    quietNote: '這不是過濾。開著的時候，會讓 Windows 不再把按鍵送到 Slime。',

    lieLowTitle: '斂息',
    lieLowLabel: '滿螢幕時自己退下',
    lieLowBlurb:
      '有東西佔滿整塊螢幕時——遊戲、影片、簡報——史萊姆會退下去，不畫也不算，等你回到桌面再重新聚形。最大化的視窗不算佔滿，牠不會為此躲起來。',
    lieLowUnsupported: '這個系統上分不出誰佔著螢幕，所以這項用不了。',

    featsTitle: '見聞',
    featsBlurb: '這隻史萊姆做過的事。只是記錄 —— 不給任何東西，也不會來找你。',
    featsLocked: '未歷',
    featsCount: '已得 {done} / {all}',

    behaviourTitle: '習性',
    behaviourDrag:
      '拖曳可以挪牠，也可以把牠甩出去。點一下是戳牠。右鍵開啟這個視窗。沒人理牠就會睡著，你伸手牠就醒。',
    behaviourKeys:
      '在 Windows 上牠還吃你敲的鍵：每隔幾秒身邊冒出一個，牠蹦過去，吞下去就長一點。那個字是你真按過的，從最近幾秒裡隨機取，順序打亂。',
    behaviourEat:
      '按住牠停在一個視窗上兩秒，牠會把那個視窗吃掉。身體還沒裹完就拉開，這頓就算了。',
    behaviourQuit: 'Ctrl+Alt+Shift+Q 在任何地方都能退出，哪怕懸浮層已經不動了。',
  },
};
