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

  schools: {
    符: { name: '符箓', blurb: '掷符，一符一敌' },
    剑: { name: '剑气', blurb: '斩出一道，沿途尽断' },
    雷: { name: '雷法', blurb: '落雷，并及其近者' },
    火: { name: '丹火', blurb: '燃于原地' },
    冰: { name: '冰魄', blurb: '周身寒域，来者迟' },
    风: { name: '风刃', blurb: '绕身而转' },
    土: { name: '山岳', blurb: '受击不损，碎则荡开' },
    毒: { name: '瘴气', blurb: '所过之处成瘴' },
    影: { name: '影卫', blurb: '一影自战' },
  },

  combos: {
    符雷: { name: '雷符', blurb: '符落处再分一道，击其近者' },
    符剑: { name: '符剑', blurb: '符先绕身三息，再飞出' },
    符土: { name: '阵符', blurb: '符不飞了，在地上连成一圈法阵' },
    符影: { name: '傀符', blurb: '影卫也会掷符' },
    剑风: { name: '风剑', blurb: '四方各斩一道' },
    剑雷: { name: '雷剑', blurb: '每一刀都往旁边引一道雷' },
    雷火: { name: '雷火', blurb: '地火向近处引雷' },
    火冰: { name: '冰火', blurb: '寒域中的敌人被点燃时炸开' },
    火毒: { name: '焚瘴', blurb: '瘴气会被点着，成片烧起来' },
    冰风: { name: '风雪', blurb: '风刃拖出霜迹，迹上也伤人' },
    冰土: { name: '玄冰甲', blurb: '壳碎后自行重结' },
    风毒: { name: '风毒', blurb: '瘴气被吹散得更宽，并会飘' },
    土影: { name: '幽壤', blurb: '壳碎时从地里起两个影卫' },
    毒影: { name: '影毒', blurb: '影卫的每一击都带瘴' },
  },

  triads: {
    符剑雷: { name: '三才剑阵', blurb: '符先落地成阵，雷引其上，剑气循阵旋出' },
    符土影: { name: '幽都印', blurb: '壳碎时地上升起符阵，阵中走出三个影卫' },
    雷火冰: { name: '三灾劫', blurb: '地火落处同时降雷，并炸开一圈寒霜' },
    冰风土: { name: '玄霜壁', blurb: '风刃不再绕身，钉在寒域边缘结成一道旋转冰墙' },
    风剑毒: { name: '瘴风刃', blurb: '剑气裹瘴而行，所过之处留下毒痕' },
    毒火影: { name: '业火鬼', blurb: '影卫浑身燃烧，走过的地方成片引火' },
    土冰影: { name: '玄冥甲', blurb: '影卫不再游走，护在身侧随甲而转' },
  },

  evolutions: {
    符: { name: '万符朝元', blurb: '每息一符，永不落空' },
    剑: { name: '万剑归宗', blurb: '斩出的不再是一道，是一片' },
    雷: { name: '九天神雷', blurb: '雷沿着敌人一路传下去' },
    火: { name: '焚天炉', blurb: '火不熄，且随你走' },
    冰: { name: '玄冰狱', blurb: '寒域之内，行者尽止' },
    风: { name: '罡风阵', blurb: '三重风刃，反向而转' },
    土: { name: '不动明山', blurb: '壳不再碎，只是荡开' },
    毒: { name: '万毒蛊', blurb: '瘴气追着敌人走' },
    影: { name: '影卫三重', blurb: '三个影卫' },
  },

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
    '墙角蹲出一朵灵芝',
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

  menu: {
    settings: '设置…',
    enterTrial: '入历练',
    leaveTrial: '结束历练',
    lockedUntil: '筑基可开',
  },

  draft: {
    choose: '择一',
    newSchool: '新法',
    raise: '精进',
    evolve: '★ 进化',
    mend: '调息',
    mendBlurb: '回复三分护体',
    levelStep: '{from}重 → {to}重',
    pairsWith: '与{school}合 · {combo}',
    triadWith: '三合 · {triad}',
  },

  trial: {
    survived: '历练已成\n除邪 {kills} · 修为大进',
    overwhelmed: '护体尽碎\n除邪 {kills} · 修为略进',
    arena: '演武已毕\n中桩 {kills} · 修为无增',
    nourishing: '温养中 · 还余 {minutes} 分钟',
    charmCount: '符箓 {count} 张',
  },

  settings: {
    arenaTitle: '演武场',
    arenaBlurb:
      '自己搭一套法脉，对着木桩打。桩不动、不还手、倒了就站回来，也没有时间限制，不点结束就一直打。不结算任何修为。',
    arenaRings:
      '桩排成三圈（150 / 290 / 430 像素）—— 哪一圈不再倒，就是这套法脉的射程边界。拖动史莱姆可以换位置（瘴气需要走起来才留痕）。拉滑块当场生效。',
    start: '上桩',
    stop: '结束',
    combosLabel: '合',
    triadLabel: '三合',
    noCombo: '这几个不相合。',
    languageTitle: '语言',
    languageBlurb: '默认跟随系统。改了立刻生效，两个窗口一起换。',
    quitLabel: '退出 Slime',
  },
};
