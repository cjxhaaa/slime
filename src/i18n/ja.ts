/**
 * 日本語.
 *
 * Japanese already owns most of this vocabulary. 練気, 築基, 金丹, 元嬰 are read as 漢語 and are how
 * 仙俠 is actually published in Japan, so translating them into native Japanese would make the text
 * *less* legible to the audience that wants this game, not more. The rule here is therefore:
 *
 * - **Keep the 漢語 where Japanese has it** — 練気, 金丹, 符籙, 剣気, 丹火, 影衛. A reader of the
 *   genre knows these on sight.
 * - **Use the Japanese form of the character**, not the Chinese one: 気 not 气, 剣 not 剑, 応 not 应.
 *   This is the part a converter gets wrong, because the simplifications are not the same set.
 * - **Furigana is not available** here — the canvas draws plain text — so anything that would need
 *   a reading gloss is written in a way that does not. 「瘴気」 stays; an invented compound would not.
 * - **Interface text is ordinary Japanese**, not 漢語: 設定, 選ぶ, やめる. The flavour belongs to the
 *   world, not to the buttons.
 *
 * I am confident in the vocabulary and the register; **the particles and the line rhythm deserve a
 * native reader's eye**, and I would not ship this to a Japanese audience without one.
 */
import type { Dictionary } from './types.js';

export const ja: Dictionary = {
  realms: ['練気', '築基', '金丹', '元嬰', '化神', '煉虚', '合体', '大乗'],
  ascended: '飛昇済み',
  stages: ['一', '二', '三', '四', '五', '六', '七', '八', '九'],
  realmStage: '{realm}{stage}層',
  fullness: ['修為初凝', '修為漸盈', '修為将満', '突破可能'],

  schools: {
    符: { name: '符籙', blurb: '符を投じ、一符一敵' },
    剑: { name: '剣気', blurb: '一閃を放ち、通り道をことごとく断つ' },
    雷: { name: '雷法', blurb: '落雷し、近くへ跳ぶ' },
    火: { name: '丹火', blurb: 'その場で燃え続ける' },
    冰: { name: '氷魄', blurb: '周囲は寒域、入る者は鈍る' },
    风: { name: '風刃', blurb: '身を巡って回る' },
    土: { name: '山岳', blurb: '石を投げ、地が裂け、柱が四方へ弾き飛ばす' },
    毒: { name: '瘴気', blurb: '通った跡が瘴となる' },
    影: { name: '影衛', blurb: '影が一体、自ら戦う' },
  },

  combos: {
    符雷: { name: '雷符', blurb: '符の落ちた所からもう一条、近い者へ' },
    符剑: { name: '符剣', blurb: '符は三息身を巡ってから飛ぶ' },
    符土: { name: '陣符', blurb: '符は飛ばず、地に法陣を組む' },
    符影: { name: '傀符', blurb: '影衛も符を投げる' },
    剑风: { name: '風剣', blurb: '四方へ一閃ずつ' },
    剑雷: { name: '雷剣', blurb: '斬るたび傍らへ雷を落とす' },
    雷火: { name: '雷火', blurb: '地の火が近くへ雷を呼ぶ' },
    火冰: { name: '氷火', blurb: '寒域の中で燃えた者は弾ける' },
    火毒: { name: '焚瘴', blurb: '瘴気に火が点き、一面に燃え広がる' },
    冰风: { name: '風雪', blurb: '風刃が霜跡を曳き、その跡も斬る' },
    冰土: { name: '凍土', blurb: '柱の立った跡が凍りつく' },
    风毒: { name: '風毒', blurb: '瘴気はより広く吹き散らされ、漂う' },
    土影: { name: '幽壌', blurb: '柱の跡から影衛が二体歩み出る' },
    毒影: { name: '影毒', blurb: '影衛は一撃ごとに瘴を帯びる' },
  },

  triads: {
    符剑雷: { name: '三才剣陣', blurb: '符が陣を成し、雷がそこへ落ち、剣気は陣に沿って旋回する' },
    符土影: { name: '幽都印', blurb: '柱の跡から符の陣が立ち上がり、その中から影衛が三体現れる' },
    雷火冰: { name: '三災劫', blurb: '地の火が落ちた所へ雷が降り、寒霜が一気に弾ける' },
    冰风土: { name: '玄霜壁', blurb: '風刃は身を離れ、寒域の縁に並んで回る氷壁となる' },
    风剑毒: { name: '瘴風刃', blurb: '剣気が瘴を纏い、通った跡に瘴を残す' },
    毒火影: { name: '業火鬼', blurb: '影衛は全身が燃え、歩いた跡が一面に燃え上がる' },
    土冰影: { name: '玄冥衛', blurb: '影衛は彷徨うのをやめ、身の回りを巡る' },
  },

  evolutions: {
    符: { name: '万符朝元', blurb: '一息ごとに一符、決して外れぬ' },
    剑: { name: '万剣帰宗', blurb: '放つのは一閃ではなく、一面' },
    雷: { name: '九天神雷', blurb: '雷は敵づたいに走り続ける' },
    火: { name: '焚天炉', blurb: '火は消えず、そして付いてくる' },
    冰: { name: '玄氷獄', blurb: '寒域の内、歩む者は止まる' },
    风: { name: '罡風陣', blurb: '三重の風刃、互いに逆へ回る' },
    土: { name: '地竜の寝返り', blurb: '石は三つに割れ、三か所が順に裂ける' },
    毒: { name: '万毒蠱', blurb: '瘴気が敵を追う' },
    影: { name: '影衛三重', blurb: '影衛が三体' },
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
    '下級の霊石を三つ拾った',
    '残巻を一枚、たまたま手に入れた',
    '石の隙間から霊根の切れ端を掘り出した',
    '軒先で朝露をひとすくい受けた',
    '風にのって香の匂いがひと筋流れてきた',
    '霊気の残った古木をかじった',
    '壁際に霊芝がひとつ生えた',
    '誰かの落とした玉簡を拾った',
    '昼のあいだ日向ぼっこをした',
    '野の実を誤って食べたら、薬になった',
    '通りすがりの道歌を半分だけ聞いた',
    '雨あがりの水たまりに星が映っていた',
    'キーボードの隙間から丹砂の粒を見つけた',
    '散る桃の花をひとひら受けとめた',
    '眠っているあいだに月華をひと口飲んだ',
    '通りすぎる剣気をかすめた',
    '古本の山から符紙が一枚出てきた',
    '捨て忘れの冷めた茶を飲んだ',
    '窓辺で清風をひとつかみ集めた',
    'げっぷをしたら、霊光が出てきた',
  ],

  feats: {
    ascend: { name: '飛昇', blurb: '八境の終わりまで歩いた' },
    reborn: { name: '転生', blurb: '八境をもう一度、練気から' },
    thrice: { name: '三度の生', blurb: '三度飛昇した' },
    ordealFailed: { name: '渡劫ならず', blurb: '符籙は尽き、修為を損なった' },
    trialFirst: { name: '初めての歴練', blurb: '一度目に入った' },
    trialSurvived: { name: '歴練成れり', blurb: '一局を最後まで持ちこたえた' },
    trialUnhurt: { name: '無傷', blurb: '護体に一つも受けず一局を終えた' },
    trialSlayer: { name: '除魔三百', blurb: '一局で三百除いた' },
    pair: { name: '合', blurb: '二つの流派を組み合わせた' },
    triad: { name: '三合', blurb: '三つの流派を組み合わせた' },
    evolve: { name: '進化', blurb: '大当たりを引いた' },
    fullSet: { name: '四脈', blurb: '四つの枠をすべて埋めた' },
    devour: { name: '窓を食う', blurb: 'ウィンドウを丸ごと飲み込んだ' },
    fortune: { name: '機縁', blurb: '何かに出くわした' },
    lieLow: { name: '退避', blurb: '一度、他の何かのために身を引いた' },
  },
  featRealm: 'はじめて{realm}に至った',

  pet: {
    readyToBreak: '{stage} · 突破可能\nクリックで渡劫',
    ordealSure: '渡劫に憂いなし',
    ordealSteady: '渡劫は穏当 · あと {short} 枚で憂いなし',
    ordealFair: '渡劫は試せる · あと {short} 枚で憂いなし',
    ordealPerilous: '渡劫は危うい · あと {short} 枚で憂いなし',
    refineLeft: '本日はあと {left} 回錬化できる',
    ordealFailed: '渡劫成らず\n符籙は尽き散り · 修為に損あり',
    featEarned: '得たり · {feat}',
    ascendedIdle: 'この身すでに大道を証せり\n設定から転生できる',
    firstBreath: 'この物、霊性あるらしく\n天地の気を呑吐している',
  },

  menu: {
    settings: '設定…',
    enterTrial: '歴練に入る',
    leaveTrial: '歴練をやめる',
    lockedUntil: '築基から',
  },

  elements: {
    金: '金',
    木: '木',
    水: '水',
    火: '火',
    土: '土',
  },

  arms: {
    刀: { name: '刀', blurb: 'その場から幾条もの刀気を薙ぐ' },
    剑: { name: '剣', blurb: '飛剣が自ら敵を追い、追いつけば連斬する' },
    盾: { name: '盾', blurb: '罡気が身を巡り、触れたものを傷つける' },
    弓: { name: '弓', blurb: '矢を一本、まっすぐに。軌道は変えない' },
    符: { name: '符籙', blurb: '符は自ら敵を探し、当たるまで止まらない' },
  },

  ways: {
    金锐: { name: '鋭金', blurb: '身を貫いて進み、一人のために止まらない' },
    金鸣: { name: '鳴金', blurb: '一撃で四方へ弾き飛ばす' },
    木缠: { name: '纏木', blurb: '当たったものは根を張り、一瞬動けなくなる' },
    木荣: { name: '栄木', blurb: '一発当たるごとに護体が少し戻る' },
    水寒: { name: '寒水', blurb: '落ちた所が凍てつき、通るものは鈍る' },
    水流: { name: '流水', blurb: '一撃が連なり、自ら次を探す' },
    火燎: { name: '燎火', blurb: '当たったものは火を帯び、しばらく燃える' },
    火爆: { name: '爆火', blurb: '落ちた所で炸裂し、近くのものを巻き込む' },
    土崩: { name: '崩土', blurb: '落ちた所で地が裂け、石柱が突き上がる' },
    土固: { name: '固土', blurb: '石の甲を身にまとい、一撃を受け止める' },
  },

  draft: {
    choose: 'ひとつ選ぶ',
    newSchool: '新法',
    raise: '精進',
    evolve: '★ 進化',
    arm: '兵器',
    way: '五行',
    swaps: '{weapon}を置く。三式はそのまま',
    mend: '調息',
    mendTitle: '護体',
    mendBlurb: '護体を三つ回復',
    shield: '金鐘',
    shieldTitle: '金鐘罩',
    shieldBlurb: '一撃を受け止める。最後の一枚が砕けると四方へ弾き、やがて組み直る',
    levelStep: '{from}重 → {to}重',
    pairsWith: '{school}と合 · {combo}',
    triadWith: '三合 · {triad}',
  },

  trial: {
    pauseTitle: '手を止めた',
    pauseNote: 'ここで去れば、この一戦は無かったことになる。',
    pauseResume: '続ける',
    pauseLeave: 'やめる',
    survived: '歴練成れり\n除魔 {kills} · 修為大いに進む',
    overwhelmed: '護体ことごとく砕けたり\n除魔 {kills} · 修為やや進む',
    arena: '演武終われり\n的中 {kills} · 修為は増えず',
    nourishing: '温養中 · 残り {minutes} 分',
    charmCount: '符籙 {count} 枚',
  },

  settings: {
    arenaTitle: '演武場',
    yardTally: '{have} / {all}',
    yardDepth: '深さ',
    start: '始める',
    stop: 'やめる',
    combosLabel: '合',
    triadLabel: '三合',
    noCombo: 'これらは噛み合わない。',
    listItem: '{name}（{blurb}）',
    listSep: '、',
    listColon: '：',
    languageTitle: '言語',
    languageAuto: '（現在はシステムに従っている）',
    quitLabel: 'Slime を終了',

    rebirthTitle: '転生',
    rebirthButton: '転生してやり直す',
    rebirthConfirm: 'よろしいか？もう一度クリック',
    rebirthWarn: '今の境地・層・修為はすべて零に戻る。取り消せない。',
    rebirthState: '{realm} · 飛昇 {times} 回 · 産出 ×{rate}',

    quietTitle: '静修',
    quietLabel: '閉関',
    quietNote: '普段はキー入力を読むが、傍に落とす文字を選ぶためだけ。有効な間、Windows はそれを渡さない。',

    lieLowTitle: '退避',
    lieLowLabel: '全画面のときは身を引く',
    lieLowUnsupported: 'この環境では判別できないため使えない。',

    featsTitle: '見聞',
    featsLocked: 'まだ',
    featsCount: '{all} のうち {done}',
  },
};
