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

  creatures: {
    goblin: ['ゴブリン', 'エリートゴブリン', 'ゴブリン王'],
    zombie: ['ゾンビ', 'エリートゾンビ', 'ゾンビ王'],
    spider: ['クモ', 'エリートクモ', 'クモの女王'],
    boar: ['イノシシ', 'エリートイノシシ', 'イノシシ王'],
    bat: ['小コウモリ', 'エリートコウモリ', 'コウモリ王'],
    drake: ['小悪竜', 'エリート悪竜', '悪竜王'],
    gunner: ['砲手ゴブリン', 'エリート砲手ゴブリン', '砲手ゴブリン王'],
    mage: ['魔導士', 'エリート魔導士', '魔導士王'],
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
    trialSurvived: { name: '歴練成れり', blurb: '首領を倒し、一関を越えた' },
    trialUnhurt: { name: '無傷', blurb: '護体に一つも受けず一関を越えた' },
    trialSlayer: { name: '除魔三百', blurb: '一局で三百除いた' },
    fullSet: { name: '三式具全', blurb: '五行の枠がすべて埋まった' },
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

  codex: {
    mergeHow: [
      '道具を同じ品階の別の道具にドラッグすると合成できます。一つをクリックしてからもう一つをクリックしても合成できます。',
      '同じ道具二つ：同じ道具になり、品階 +1。',
      '違う道具二つ：今回選んだ五種類の中からランダムに一つになり、品階 +1。',
      '品階が高いほど効果が強くなり、最大 6 階です。道具にマウスを合わせると、各品階の数値を確認できます。',
    ],
    grade: '{n} 階',
    armsNote: '同じ兵器を複数持っていると、それぞれが別々に攻撃します。敵の残り体力を超えたダメージは、{spill} 以内の他の敵に分配されます。',
    waysNote: '五行はすべての兵器の命中ごとに発動します。同じ五行を複数持つと効果が重なります（1 階二つで 1.6 階ほど）。',
    hoverHint: '装備欄の道具は品階ごとに色が変わります',
    seconds: '{v} 秒',
    stat: {
      damage: 'ダメージ',
      every: '間隔',
      blades: '刀気の数',
      swords: '飛剣の数',
      nodes: '罡気の数',
      ring: '周回半径',
      pierce: '追加貫通',
      knock: 'ノックバック範囲',
      hold: '拘束',
      heal: '1 点回復まで',
      patch: '冷気の半径',
      jump: '跳ね返り距離',
      burn: '燃焼時間',
      blast: '爆発半径',
      targets: '最大対象数',
      rings: '石柱の輪',
      reach: '範囲',
      layers: '石甲の層',
    },
    arms: {
      刀: '{every} 秒ごとに、最も近い敵へ扇状に {blades} 本の刀気を放つ。刀気は約 {travel} 前進し、一本で最大 {bite} 体を斬る。',
      剑: '飛剣を {swords} 本放つ。飛剣は自動で敵を追い、追いつくと {flurry} 回連続で斬る。飛剣は消えず、次の標的を探し続ける。',
      盾: '{nodes} 個の罡気が体の周り（半径 {ring}）を回り、触れた敵にダメージを与える。一つ命中するごとに {cool} 秒止まる。',
      弓: '{every} 秒ごとに、{range} 以内で最も近い敵へ矢を放つ。矢は敵一体に当たると消える。',
      符: '{every} 秒ごとに符を一枚放つ。符は敵を自動で追いかけ、最大 {life} 秒飛び、敵一体に当たると消える。',
    },
    ways: {
      金锐: '矢・刀気・符は当たっても消えず、さらに {pierce} 体を貫通する。飛剣と罡気には効果なし。',
      金鸣: '命中するたびに、{reach} 以内の敵を外側へ弾き飛ばす。',
      木缠: '命中するたびに、{reach} 以内の敵を {hold} 秒その場に拘束する。',
      木荣: '命中するたびに護体を回復する。最大で {per} 秒ごとに 1 点。（敵に一度触れられると護体が 1 点減る）',
      水寒: '命中した場所に半径 {patch} の冷気を {last} 秒残す。冷気の中の敵は移動速度が {slow}% 下がる。',
      水流: '命中するたびに、{jump} 以内で最も近い別の敵へ跳ね返り、1 ダメージを与える。',
      火燎: '命中した場所の近くの敵を {burn} 秒燃やし、{beat} 秒ごとに 1 ダメージを与える。',
      火爆: '命中した場所で爆発し、半径 {blast} 以内の敵最大 {targets} 体に 1 ダメージを与える。',
      土崩: '命中した場所の地面が割れ、{rings} 重の石柱が外へ突き上がる（範囲 {reach}）。石柱一本ごとに 1 ダメージ。',
      土固: '石甲を {layers} 層まとう。一層ごとに敵の接触を一回防ぐ。すべて割れると {shove} 以内の敵を弾き飛ばし、{back} 秒後に生え直す。',
    },
  },

  kit: {
    arm: '兵器',
    way: '五行',
  },

  loadout: {
    title: 'この関に携えるもの',
    arms: '兵器 · 二つ選ぶ',
    ways: '五行 · 三つ選ぶ',
    start: '始める',
    level: '第 {level} 関',
    capped: '{realm}で挑める最後の関',
  },
  bar: {
    silver: '銀 {silver}',
    buy: '買う {price}',
    found: '+{silver} 銀',
  },

  trial: {
    pauseTitle: '手を止めた',
    pauseNote: 'ここで去れば、この一戦は無かったことになる。',
    pauseResume: '続ける',
    pauseLeave: 'やめる',
    cleared: '第{level}関、越えたり\n除魔 {kills} · 修為大いに進む',
    overwhelmed: '護体ことごとく砕けたり\n第{level}関・第{wave}波 · 除魔 {kills} · 修為やや進む',
    capReached: '{realm}ではここまで · {next}に突破すれば先へ進める',
    arena: '演武終われり\n的中 {kills} · 修為は増えず',
    nourishing: '温養中 · 残り {minutes} 分',
    charmCount: '符籙 {count} 枚',
    yardOutput: '手数',
    yardRate: '毎秒 {rate}',
    yardTotal: '計 {hits} · {seconds} 秒',
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
    generalTitle: '起居',
    abodeTitle: '洞府',
    skinWorn: '着',
    codexTitle: '図鑑',
    codexGrades: '品階',
    languageAuto: '（現在はシステムに従っている）',
    quitLabel: 'Slime を終了',
    skinTitle: '見た目',
    skinClassic: 'スライム',
    skinNote: '見た目を変えても修行や動きは変わりません。自作の見た目はスキンフォルダに、一つずつサブフォルダで入れてください。',
    skinFolder: 'スキンフォルダを開く',
    skinRescan: '再読み込み',
    skinBroken: '{name} は使えません：{error}',
    skinBy: '作者：{author}',

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
