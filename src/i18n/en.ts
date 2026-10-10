/**
 * English.
 *
 * The only one of the five with **no shared vocabulary**, so it is the only one that has to decide
 * between transliterating and translating for every term. The rule used here, which is roughly what
 * the genre's English-language publishing has settled on:
 *
 * - **Realms are transliterated**, because they are proper nouns and a reader will meet them
 *   hundreds of times: Qi Refining, Foundation, Golden Core, Nascent Soul. Translating 元婴 as
 *   "Infant Origin" is accurate and reads like a botany textbook.
 * - **Schools are translated**, because they have to say what the thing *does* on a card you read
 *   in two seconds under a clock. "Talisman" beats "Fulu"; nobody is learning nine new nouns mid-run.
 * - **Combinations are translated compounds** — Thunder Seal, Array of Talismans, Frostplate. These
 *   are the names you are meant to recognise as *both* of the things you are holding, so the two
 *   halves have to be visible in the name.
 * - **Evolutions keep the grandeur.** They are the rarest thing in the mode and the one place the
 *   text is allowed to be operatic: Ten Thousand Talismans, All Swords Return, Nine Heavens Thunder.
 *
 * The 机缘 lines are the hardest part and are translated for *tone* rather than literally. 「打了个
 * 嗝，竟吐出灵光」 is a joke about a slime burping, and a literal "belched, and spat out spirit
 * light" loses the timing. What matters is that they read as twenty small pieces of good luck.
 */
import type { Dictionary } from './types.js';

export const en: Dictionary = {
  realms: [
    'Qi Refining',
    'Foundation',
    'Golden Core',
    'Nascent Soul',
    'Spirit Severing',
    'Void Refining',
    'Unity',
    'Great Vehicle',
  ],
  ascended: 'Ascended',
  stages: ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
  realmStage: '{realm} Layer {stage}',
  fullness: ['Barely gathered', 'Gathering', 'Nearly full', 'Ready to break through'],

  schools: {
    符: { name: 'Charm', blurb: 'One charm, one target' },
    剑: { name: 'Sword Qi', blurb: 'A crescent that cuts through' },
    雷: { name: 'Thunder', blurb: 'Strikes, then jumps to its neighbour' },
    火: { name: 'Pill Fire', blurb: 'Burns where it fell' },
    冰: { name: 'Ice Soul', blurb: 'A cold field; whatever enters slows' },
    风: { name: 'Wind Blade', blurb: 'Turns about the body' },
    土: { name: 'Mountain', blurb: 'Throws a stone; the ground opens and hurls them back' },
    毒: { name: 'Miasma', blurb: 'Fouls the ground you cross' },
    影: { name: 'Shadow Guard', blurb: 'One shade, fighting alone' },
  },

  combos: {
    符雷: { name: 'Thunder Charm', blurb: 'Where a charm lands, one more forks to the nearest' },
    符剑: { name: 'Charm Sword', blurb: 'The charm circles you three breaths, then flies' },
    符土: { name: 'Charm Array', blurb: 'They stop flying and stand in a ring on the ground' },
    符影: { name: 'Paper Effigy', blurb: 'The shade throws charms too' },
    剑风: { name: 'Wind Sword', blurb: 'One crescent to each of the four quarters' },
    剑雷: { name: 'Thunder Sword', blurb: 'Every cut draws a bolt down beside it' },
    雷火: { name: 'Thunderfire', blurb: 'The ground fire reaches out for lightning' },
    火冰: { name: 'Icefire', blurb: 'Anything burning inside the cold field bursts' },
    火毒: { name: 'Burning Miasma', blurb: 'The cloud catches, and takes the rest with it' },
    冰风: { name: 'Windsnow', blurb: 'The blades trail frost, and the frost bites' },
    冰土: { name: 'Frozen Ground', blurb: 'Where the pillars rose, the ground stays cold' },
    风毒: { name: 'Windborne Miasma', blurb: 'The cloud is blown wider, and drifts' },
    土影: { name: 'Shadowed Earth', blurb: 'Two shadow guards walk out of the broken ground' },
    毒影: { name: 'Venomed Shade', blurb: 'Every blow the shade lands is poisoned' },
  },

  triads: {
    符剑雷: {
      name: 'Three Powers Sword Array',
      blurb: 'Charms fall into an array, lightning earths on it, and the crescents spiral out along it',
    },
    符土影: {
      name: 'Underworld Seal',
      blurb: 'A ring of talismans rises from the broken ground, and three shadow guards step out of it',
    },
    雷火冰: {
      name: 'Three Calamities',
      blurb: 'Every flame calls lightning down and bursts a ring of frost',
    },
    冰风土: {
      name: 'Rimewall',
      blurb: 'The blades leave the body and pin to the cold rim as a turning wall of ice',
    },
    风剑毒: { name: 'Miasma Edge', blurb: 'The crescents carry poison and lay it along their path' },
    毒火影: { name: 'Karmic Fire Ghost', blurb: 'The shades burn as they travel, setting the ground alight' },
    土冰影: {
      name: 'Dark Watch',
      blurb: 'The shadow guards stop roaming and circle the body instead',
    },
  },

  evolutions: {
    符: { name: 'Ten Thousand Charms', blurb: 'A charm every breath, and none of them miss' },
    剑: { name: 'All Swords Return', blurb: 'Not one crescent — a sheaf of them' },
    雷: { name: 'Nine Heavens Thunder', blurb: 'The bolt runs the whole length of them' },
    火: { name: 'Sky-Burning Furnace', blurb: 'It never goes out, and it follows you' },
    冰: { name: 'Black Ice Prison', blurb: 'Inside the field, nothing walks' },
    风: { name: 'Gale Array', blurb: 'Three rings of blades, turning against each other' },
    土: { name: 'Dragon Turning', blurb: 'The stone splits in three; three patches open in turn' },
    毒: { name: 'Ten Thousand Venoms', blurb: 'The cloud hunts' },
    影: { name: 'Threefold Shade', blurb: 'Three of them' },
  },

  breeds: {
    drift: 'Drifter',
    dart: 'Charger',
    weave: 'Circler',
    split: 'Splitter',
    heavy: 'Hulk',
    root: 'Anchor',
  },

  finds: [
    'Found three low-grade spirit stones',
    'Came across a torn page of some manual',
    'Dug half a spirit root out of a crack',
    'Caught a handful of morning dew off the eaves',
    'A thread of incense drifted past on the wind',
    'Gnawed a piece of old wood with qi still in it',
    'A lingzhi came up in the corner',
    'Picked up a jade slip somebody dropped',
    'Sat in the sun for half the afternoon',
    'Ate a wild berry by mistake; it turned out medicinal',
    'Overheard half a passing chant',
    'Read the stars in a puddle after the rain',
    'Fished a grain of cinnabar out of the keyboard',
    'Caught a falling peach blossom',
    'Swallowed a mouthful of moonlight while asleep',
    'Brushed against a stray thread of sword qi',
    'Turned up a sheet of charm paper in a pile of old books',
    'Drank the cold tea somebody forgot to throw out',
    'Gathered a handful of clean wind off the windowsill',
    'Burped, and out came a little spirit light',
  ],

  feats: {
    ascend: { name: 'Ascended', blurb: 'Walked the eight realms to the end of them' },
    reborn: { name: 'Reborn', blurb: 'Began the eight realms again from Qi Refining' },
    thrice: { name: 'Three Lives', blurb: 'Ascended three times' },
    ordealFailed: { name: 'The Ordeal Failed', blurb: 'The charms were spent and progress was lost' },
    trialFirst: { name: 'Into the Trial', blurb: 'Went in for the first time' },
    trialSurvived: { name: 'Trial Complete', blurb: 'Lasted a whole run' },
    trialUnhurt: { name: 'Untouched', blurb: 'Lasted a whole run without the guard being reached' },
    trialSlayer: { name: 'Three Hundred', blurb: 'Three hundred slain in a single run' },
    pair: { name: 'Paired', blurb: 'Put two schools together' },
    triad: { name: 'Triad', blurb: 'Put three schools together' },
    evolve: { name: 'Evolved', blurb: 'Drew a jackpot' },
    fullSet: { name: 'Four Schools', blurb: 'Filled all four slots' },
    devour: { name: 'Window Eaten', blurb: 'Swallowed a window whole' },
    fortune: { name: 'A Find', blurb: 'Came across something' },
    lieLow: { name: 'Lay Low', blurb: 'Stepped aside for something else once' },
  },
  featRealm: 'Reached {realm} for the first time',

  pet: {
    readyToBreak: '{stage} · ready to break through\nClick to face the ordeal',
    ordealSure: 'The ordeal holds no danger',
    ordealSteady: 'Ordeal steady · {short} charms short of sure',
    ordealFair: 'Ordeal worth a try · {short} charms short of sure',
    ordealPerilous: 'Ordeal risky · {short} charms short of sure',
    refineLeft: 'Refinings left today · {left}',
    ordealFailed: 'The ordeal was not passed\nThe charms are spent · some progress lost',
    featEarned: 'Earned · {feat}',
    ascendedIdle: 'This body has proven the Way\nRebirth waits in the settings',
    firstBreath: 'There seems to be a spirit in this thing\nIt is drawing breath from the world',
  },

  menu: {
    settings: 'Settings…',
    enterTrial: 'Enter the Trial',
    leaveTrial: 'Leave the Trial',
    lockedUntil: 'Opens at Foundation',
  },

  arms: {
    刀: { name: 'Sabre', blurb: 'Cuts several arcs of qi along the ground' },
    剑: { name: 'Sword', blurb: 'A flying sword hunts on its own, and flurries where it lands' },
    盾: { name: 'Shield', blurb: 'Qi circles the body, and what it passes through is hurt' },
    弓: { name: 'Bow', blurb: 'One arrow, straight out, and it does not turn' },
    符: { name: 'Talisman', blurb: 'The charm finds its own mark and will not stop short' },
  },

  ways: {
    金锐: { name: 'Keen Metal', blurb: 'Passes through, and does not stop for one' },
    金鸣: { name: 'Ringing Metal', blurb: 'One strike throws them off in every direction' },
    木缠: { name: 'Binding Wood', blurb: 'What it strikes takes root, and cannot move for a moment' },
    木荣: { name: 'Flourishing Wood', blurb: 'Every hit gives a little of the body back' },
    水寒: { name: 'Cold Water', blurb: 'Where it lands turns cold, and what crosses it slows' },
    水流: { name: 'Flowing Water', blurb: 'One strike carries on to the next of them' },
    火燎: { name: 'Spreading Fire', blurb: 'What it strikes catches, and burns for a while' },
    火爆: { name: 'Bursting Fire', blurb: 'It goes off where it lands, and everything near it is hurt' },
    土崩: { name: 'Crumbling Earth', blurb: 'The ground splits where it lands and stone heaves up' },
    土固: { name: 'Firm Earth', blurb: 'Stone armour on the body, and a hit does not land' },
  },

  draft: {
    choose: 'Choose one',
    newSchool: 'New',
    raise: 'Deepen',
    evolve: '★ Evolve',
    arm: 'Arm',
    way: 'Phase',
    swaps: 'Puts down {weapon}; your three stay',
    mend: 'Mend',
    mendTitle: 'Guard',
    mendBlurb: 'Restores three points of guard',
    shield: 'Ward',
    shieldTitle: 'Bell of Gold',
    shieldBlurb: 'Eats one hit; when the last breaks it throws them off, then re-forms',
    levelStep: 'Level {from} → {to}',
    pairsWith: 'With {school} · {combo}',
    triadWith: 'Triad · {triad}',
  },

  trial: {
    pauseTitle: 'Stopped',
    pauseNote: 'Leave now and this run does not count.',
    pauseResume: 'Keep going',
    pauseLeave: 'Leave',
    survived: 'Trial complete\n{kills} slain · progress much advanced',
    overwhelmed: 'The guard is wholly shattered\n{kills} slain · progress a little advanced',
    arena: 'Practice over\n{kills} posts struck · progress unchanged',
    nourishing: 'Nourishing · {minutes} min left',
    charmCount: 'Charms · {count}',
  },

  settings: {
    arenaTitle: 'Practice Yard',
    start: 'Begin',
    stop: 'Stop',
    combosLabel: 'Pairings',
    triadLabel: 'Triad',
    noCombo: 'These do not combine.',
    listItem: '{name} ({blurb})',
    listSep: ', ',
    listColon: ': ',
    languageTitle: 'Language',
    languageAuto: '(currently following the system)',
    quitLabel: 'Quit Slime',

    rebirthTitle: 'Rebirth',
    rebirthButton: 'Begin again',
    rebirthConfirm: 'Sure? Click again',
    rebirthWarn: 'Your realm, stage and progress are cleared. This cannot be undone.',
    rebirthState: '{realm} · ascended {times}× · output ×{rate}',

    quietTitle: 'Quiet',
    quietLabel: 'Seclusion',
    quietNote:
      'It reads keystrokes only to pick a glyph to drop beside it. While this is on, Windows stops delivering them.',

    lieLowTitle: 'Lie Low',
    lieLowLabel: 'Step aside for full-screen apps',
    lieLowUnsupported: 'This system cannot tell, so it is unavailable.',

    featsTitle: 'Doings',
    featsLocked: 'not yet',
    featsCount: '{done} of {all}',
  },
};
