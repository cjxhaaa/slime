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

  creatures: {
    goblin: ['Goblin', 'Goblin Elite', 'Goblin King'],
    zombie: ['Zombie', 'Zombie Elite', 'Zombie King'],
    spider: ['Spider', 'Spider Elite', 'Spider Queen'],
    boar: ['Boar', 'Boar Elite', 'Boar King'],
    bat: ['Bat', 'Bat Elite', 'Bat King'],
    drake: ['Wyrmling', 'Drake Elite', 'Drake King'],
    gunner: ['Goblin Gunner', 'Gunner Elite', 'Gunner King'],
    mage: ['Mage', 'Mage Elite', 'Mage King'],
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
    trialSurvived: { name: 'Trial Complete', blurb: 'Brought down a boss and cleared a level' },
    trialUnhurt: { name: 'Untouched', blurb: 'Cleared a level without the guard being reached' },
    trialSlayer: { name: 'Three Hundred', blurb: 'Three hundred slain in a single run' },
    fullSet: { name: 'All Three', blurb: 'Every phase slot filled' },
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

  elements: {
    金: 'Metal',
    木: 'Wood',
    水: 'Water',
    火: 'Fire',
    土: 'Earth',
  },

  arms: {
    刀: { name: 'Sabre', blurb: 'Cuts several arcs of qi along the ground' },
    剑: { name: 'Sword', blurb: 'Hunts on its own, and flurries where it lands' },
    盾: { name: 'Shield', blurb: 'Qi circles the body, and what it passes through is hurt' },
    弓: { name: 'Bow', blurb: 'One arrow, straight out, and it does not turn' },
    符: { name: 'Talisman', blurb: 'The charm finds its own mark and will not stop short' },
  },

  ways: {
    金锐: { name: 'Keen Metal', blurb: 'Passes through, and does not stop for one' },
    金鸣: { name: 'Ringing Metal', blurb: 'One strike throws them off in every direction' },
    木缠: { name: 'Binding Wood', blurb: 'What it strikes takes root for a moment' },
    木荣: { name: 'Flourishing Wood', blurb: 'Every hit gives a little of the body back' },
    水寒: { name: 'Cold Water', blurb: 'Where it lands turns cold, and what crosses it slows' },
    水流: { name: 'Flowing Water', blurb: 'One strike carries on to the next of them' },
    火燎: { name: 'Spreading Fire', blurb: 'What it strikes catches, and burns for a while' },
    火爆: { name: 'Bursting Fire', blurb: 'Goes off where it lands, hurting everything near' },
    土崩: { name: 'Crumbling Earth', blurb: 'The ground splits where it lands and stone heaves up' },
    土固: { name: 'Firm Earth', blurb: 'Stone armour on the body, and a hit does not land' },
  },

  codex: {
    mergeHow: [
      'Drag an item onto another item of the same grade to merge them. You can also click one, then click the other.',
      'Two of the same item: you get that item, one grade higher.',
      'Two different items: you get a random one of the five you picked for this level, one grade higher.',
      'Higher grades are stronger, up to grade 6. Hover over an item to see its numbers at every grade.',
    ],
    grade: 'Grade {n}',
    armsNote: 'Carrying more than one of a weapon means each copy attacks on its own. Damage beyond what an enemy has left spills onto other enemies within {spill}.',
    waysNote: 'A way triggers on every hit from every weapon. Copies of the same way stack: two at grade 1 are worth about one at grade 1.6.',
    hoverHint: 'Items on the bar are coloured by grade',
    seconds: '{v}s',
    stat: {
      damage: 'Damage',
      every: 'Every',
      blades: 'Waves',
      swords: 'Swords',
      nodes: 'Orbs',
      ring: 'Orbit',
      pierce: 'Extra pierce',
      knock: 'Knockback',
      hold: 'Root',
      heal: '1 point per',
      patch: 'Patch',
      jump: 'Bounce',
      burn: 'Burn',
      blast: 'Blast',
      targets: 'Max hits',
      rings: 'Rings',
      reach: 'Range',
      layers: 'Layers',
    },
    arms: {
      刀: 'Every {every}s, slashes {blades} blade waves in a fan toward the nearest enemy. Each wave travels about {travel} and cuts up to {bite} enemies.',
      剑: 'Sends out {swords} flying sword(s) that chase enemies down and strike {flurry} times when they catch one. They never expire and keep looking for the next target.',
      盾: '{nodes} orbs of qi circle the body (radius {ring}) and damage enemies they touch. Each orb rests {cool}s after a hit.',
      弓: 'Every {every}s, shoots an arrow at the nearest enemy within {range}. The arrow is gone after hitting one enemy.',
      符: 'Every {every}s, throws a talisman that homes in on enemies for up to {life}s and is gone after hitting one.',
    },
    ways: {
      金锐: 'Arrows, blade waves and talismans keep going after a hit and pierce {pierce} more enemies. No effect on flying swords or qi orbs.',
      金鸣: 'Every hit knocks enemies within {reach} outward.',
      木缠: 'Every hit roots enemies within {reach} in place for {hold}s.',
      木荣: 'Every hit restores your guard, at most 1 point every {per}s. (Each enemy touch costs 1 point of guard.)',
      水寒: 'Leaves a patch of cold, radius {patch}, for {last}s where it hits. Enemies inside move {slow}% slower.',
      水流: 'After every hit, bounces to the nearest other enemy within {jump} for 1 damage.',
      火燎: 'Sets enemies near the hit on fire for {burn}s, dealing 1 damage every {beat}s.',
      火爆: 'Explodes where it hits, dealing 1 damage to up to {targets} enemies within {blast}.',
      土崩: 'The ground splits where it hits and {rings} rings of stone burst outward (range {reach}). Each stone deals 1 damage.',
      土固: 'Wears {layers} layer(s) of stone armour; each blocks one enemy touch. When the last breaks it knocks enemies within {shove} away, and it grows back after {back}s.',
    },
  },

  kit: {
    arm: 'Arm',
    way: 'Phase',
  },

  loadout: {
    title: 'What to take into this level',
    arms: 'Arms · pick two',
    ways: 'Phases · pick three',
    start: 'Begin',
    level: 'Level {level}',
    capped: 'the last level {realm} can reach',
  },
  bar: {
    silver: 'Silver {silver}',
    buy: 'Buy {price}',
    found: '+{silver} silver',
  },

  trial: {
    pauseTitle: 'Stopped',
    pauseNote: 'Leave now and this run does not count.',
    pauseResume: 'Keep going',
    pauseLeave: 'Leave',
    cleared: 'Level {level} cleared\n{kills} slain · progress much advanced',
    overwhelmed: 'The guard is wholly shattered\nLevel {level}, wave {wave} · {kills} slain · progress a little advanced',
    capReached: '{realm} can go no further · break through to {next} to climb on',
    arena: 'Practice over\n{kills} posts struck · progress unchanged',
    nourishing: 'Nourishing · {minutes} min left',
    charmCount: 'Charms · {count}',
    yardOutput: 'Output',
    yardRate: '{rate} hits/s',
    yardTotal: '{hits} hits · {seconds}s',
  },

  settings: {
    arenaTitle: 'Practice Yard',
    yardTally: '{have} / {all}',
    yardDepth: 'Depth',
    start: 'Begin',
    stop: 'Stop',
    combosLabel: 'Pairings',
    triadLabel: 'Triad',
    noCombo: 'These do not combine.',
    listItem: '{name} ({blurb})',
    listSep: ', ',
    listColon: ': ',
    languageTitle: 'Language',
    generalTitle: 'Daily',
    abodeTitle: 'Abode',
    skinWorn: '✓',
    codexTitle: 'Codex',
    codexGrades: 'Grades',
    languageAuto: '(currently following the system)',
    quitLabel: 'Quit Slime',
    skinTitle: 'Look',
    skinClassic: 'Slime',
    skinNote: 'A different look changes nothing about progress or behaviour. Your own skins go in the skins folder, one subfolder each.',
    skinFolder: 'Open skins folder',
    skinRescan: 'Rescan',
    skinBroken: 'Can\'t use {name}: {error}',
    skinBy: 'By {author}',

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
