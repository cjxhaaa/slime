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

  schools: {
    符: { name: '符籙', blurb: '符を投じ、一符一敵' },
    剑: { name: '剣気', blurb: '一閃を放ち、道すがら断つ' },
    雷: { name: '雷法', blurb: '落雷し、近くへ跳ぶ' },
    火: { name: '丹火', blurb: 'その場で燃え続ける' },
    冰: { name: '氷魄', blurb: '周囲は寒域、入る者は鈍る' },
    风: { name: '風刃', blurb: '身を巡って回る' },
    土: { name: '山岳', blurb: '一撃を受け止め、砕けて弾く' },
    毒: { name: '瘴気', blurb: '通った跡が瘴となる' },
    影: { name: '影衛', blurb: '影がひとり、自ら戦う' },
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
    冰土: { name: '玄氷甲', blurb: '殻は砕けても自ら結び直す' },
    风毒: { name: '風毒', blurb: '瘴気はより広く吹き散らされ、漂う' },
    土影: { name: '幽壌', blurb: '殻が砕けると地から影衛が二体' },
    毒影: { name: '影毒', blurb: '影衛の一撃ごとに瘴を帯びる' },
  },

  triads: {
    符剑雷: { name: '三才剣陣', blurb: '符が陣を成し、雷がそこへ落ち、剣気は陣に沿って旋回する' },
    符土影: { name: '幽都印', blurb: '殻が砕けると地に符陣が浮かび、影衛が三体歩み出る' },
    雷火冰: { name: '三災劫', blurb: '地の火が落ちた所へ雷が降り、寒霜が一気に弾ける' },
    冰风土: { name: '玄霜壁', blurb: '風刃は身を離れ、寒域の縁に並んで回る氷壁となる' },
    风剑毒: { name: '瘴風刃', blurb: '剣気が瘴を纏い、通った跡に毒を残す' },
    毒火影: { name: '業火鬼', blurb: '影衛は全身が燃え、歩いた跡が一面に燃え上がる' },
    土冰影: { name: '玄冥甲', blurb: '影衛は彷徨わず、甲と共に傍らを回って守る' },
  },

  evolutions: {
    符: { name: '万符朝元', blurb: '一息に一符、決して外れぬ' },
    剑: { name: '万剣帰宗', blurb: '放つのは一閃ではなく、一面' },
    雷: { name: '九天神雷', blurb: '雷は敵づたいに走り続ける' },
    火: { name: '焚天炉', blurb: '火は消えず、そして付いてくる' },
    冰: { name: '玄氷獄', blurb: '寒域の内、歩む者は止まる' },
    风: { name: '罡風陣', blurb: '三重の風刃、互いに逆へ回る' },
    土: { name: '不動明山', blurb: '殻はもう砕けない。ただ弾き返す' },
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
    '下品の霊石を三つ拾った',
    '残巻を一枚、たまたま手に入れた',
    '石の隙間から霊根の切れ端を掘り出した',
    '軒先で朝露をひとすくい受けた',
    '風にのって香の匂いがひと筋',
    '霊気の残った古木をかじった',
    '壁際に霊芝がひとつ生えた',
    '誰かの落とした玉簡を拾った',
    '昼のあいだ日向ぼっこをした',
    '野の実を誤って食べたら、薬になった',
    '通りすがりの道音を半分だけ聞いた',
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

  menu: {
    settings: '設定…',
    enterTrial: '歴練に入る',
    leaveTrial: '歴練をやめる',
    lockedUntil: '築基から',
  },

  draft: {
    choose: 'ひとつ選ぶ',
    newSchool: '新法',
    raise: '精進',
    evolve: '★ 進化',
    mend: '調息',
    mendBlurb: '護体を三つ回復',
    levelStep: '{from}重 → {to}重',
    pairsWith: '{school}と合 · {combo}',
    triadWith: '三合 · {triad}',
  },

  trial: {
    survived: '歴練成れり\n除邪 {kills} · 修為大いに進む',
    overwhelmed: '護体尽く砕く\n除邪 {kills} · 修為やや進む',
    arena: '演武おわり\n的中 {kills} · 修為は増えず',
    nourishing: '温養中 · 残り {minutes} 分',
    charmCount: '符籙 {count} 枚',
  },

  settings: {
    arenaTitle: '演武場',
    arenaBlurb:
      '自分で法脈を組み、木人に打ち込む。木人は動かず、反撃せず、倒れてもまた立つ。時間制限もなく、やめるまで続く。修為は一切増えない。',
    arenaRings:
      '木人は三重の輪に並ぶ（150 / 290 / 430 ピクセル）。倒れなくなった輪が、その法脈の射程の境目。スライムをドラッグすれば位置を変えられる（瘴気は歩かないと跡が残らない）。スライダーはその場で反映される。',
    start: '始める',
    stop: 'やめる',
    combosLabel: '合',
    triadLabel: '三合',
    noCombo: 'これらは噛み合わない。',
    languageTitle: '言語',
    languageBlurb: '既定はシステムに従う。変更は両方の窓にすぐ反映される。',
    quitLabel: 'Slime を終了',
  },
};
