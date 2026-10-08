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
    土: { name: 'Mountain', blurb: 'Eats a blow, then throws them off' },
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
    冰土: { name: 'Frostplate', blurb: 'The shell re-forms itself after it breaks' },
    风毒: { name: 'Windborne Miasma', blurb: 'The cloud is blown wider, and drifts' },
    土影: { name: 'Shadowed Earth', blurb: 'Two shades rise from where the shell broke' },
    毒影: { name: 'Venomed Shade', blurb: 'Every blow the shade lands is poisoned' },
  },

  triads: {
    符剑雷: {
      name: 'Three Powers Sword Array',
      blurb: 'Charms fall into an array, lightning earths on it, and the crescents spiral out along it',
    },
    符土影: {
      name: 'Underworld Seal',
      blurb: 'The breaking shell raises an array, and three shades step out of it',
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
    土冰影: { name: 'Nightplate', blurb: 'The shades stop hunting and turn at your side with the shell' },
  },

  evolutions: {
    符: { name: 'Ten Thousand Charms', blurb: 'A charm every breath, and none of them miss' },
    剑: { name: 'All Swords Return', blurb: 'Not one crescent — a sheaf of them' },
    雷: { name: 'Nine Heavens Thunder', blurb: 'The bolt runs the whole length of them' },
    火: { name: 'Sky-Burning Furnace', blurb: 'It never goes out, and it follows you' },
    冰: { name: 'Black Ice Prison', blurb: 'Inside the field, nothing walks' },
    风: { name: 'Gale Array', blurb: 'Three rings of blades, turning against each other' },
    土: { name: 'Immovable Mountain', blurb: 'The shell no longer breaks; it only throws them off' },
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

  draft: {
    choose: 'Choose one',
    newSchool: 'New',
    raise: 'Deepen',
    evolve: '★ Evolve',
    mend: 'Mend',
    mendTitle: 'Guard',
    mendBlurb: 'Restores three points of guard',
    levelStep: 'Level {from} → {to}',
    pairsWith: 'With {school} · {combo}',
    triadWith: 'Triad · {triad}',
  },

  trial: {
    survived: 'Trial complete\n{kills} slain · progress much advanced',
    overwhelmed: 'The guard is wholly shattered\n{kills} slain · progress a little advanced',
    arena: 'Practice over\n{kills} posts struck · progress unchanged',
    nourishing: 'Nourishing · {minutes} min left',
    charmCount: 'Charms · {count}',
  },

  settings: {
    arenaTitle: 'Practice Yard',
    arenaBlurb:
      'Build a set by hand and hit the posts with it. They do not hit back, and they get up again. Runs until you stop it, and nothing is gained.',
    arenaRings:
      'The posts stand in three rings. Whichever ring stops falling is as far as this set reaches. Drag the slime to move it; Miasma needs you walking to leave a trail. Sliders apply live.',
    start: 'Begin',
    stop: 'Stop',
    combosLabel: 'Pairings',
    triadLabel: 'Triad',
    noCombo: 'These do not combine.',
    listItem: '{name} ({blurb})',
    listSep: ', ',
    listColon: ': ',
    languageTitle: 'Language',
    languageBlurb: 'Follows the system by default. Both windows change at once.',
    languageAuto: '(currently following the system)',
    quitLabel: 'Quit Slime',

    rebirthTitle: 'Rebirth',
    rebirthBlurb:
      'Walk the eight realms again from Qi Refining. Ascensions, output multiplier and the daily refining tier all stay, and so does the glow.',
    rebirthButton: 'Begin again',
    rebirthConfirm: 'Sure? Click again',
    rebirthWarn: 'Your realm, stage and progress are cleared. This cannot be undone.',
    rebirthState: '{realm} · ascended {times}× · output ×{rate}',

    quietTitle: 'Quiet',
    quietLabel: 'Seclusion',
    quietBlurb:
      'Stops reading the keyboard and stops reacting to anything. It keeps cultivating, quietly.',
    quietNote:
      'While it is on, Windows stops delivering keystrokes to Slime. Not filtered here; never received.',

    lieLowTitle: 'Lie Low',
    lieLowLabel: 'Step aside for full-screen apps',
    lieLowBlurb:
      'Hides while a game, a film or a presentation has the whole screen, and comes back when you do. A maximized window does not count.',
    lieLowUnsupported: 'This system cannot tell, so it is unavailable.',

    featsTitle: 'Doings',
    featsBlurb: 'What this slime has done. A record; it grants nothing.',
    featsLocked: 'not yet',
    featsCount: '{done} of {all}',

    behaviourTitle: 'Behaviour',
    behaviourDrag:
      'Drag it to move it, or throw it. Click to poke. Right-click opens this window. It sleeps when left alone and wakes when you reach for it.',
    behaviourKeys:
      'On Windows it also eats the keys you type. A letter turns up beside it, it hops over and swallows it, and grows a little. The letter is one you really pressed, picked at random and out of order.',
    behaviourEat:
      'Hold it still over a window and it eats the window. Pull it away before the body closes and the meal is off.',
    behaviourQuit:
      'Ctrl+Alt+Shift+Q quits from anywhere, even if the overlay has stopped responding.',
  },
};
