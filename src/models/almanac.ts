import { MONSTER_CATALOG } from './catalog';

export const MONSTER_LORE: Record<(typeof MONSTER_CATALOG)[number]['modelId'], string> = {
  alien:
    'Those antennae pick up every snack packet in the house. Claims it came in peace; the biscuit tin disagrees.',
  cthulhu:
    'An ancient terror with tiny wings and a face full of noodles. Mostly summons damp towels from the bathroom floor.',
  cyclops:
    'Has one enormous eye and still cannot find the remote. Blames depth perception whenever it bumps into a chair.',
  demon:
    'Practises looking menacing in the toaster reflection. Its horns are excellent for carrying two extra doughnuts.',
  ghost:
    'Floats through walls but politely waits for automatic doors. Haunts the fridge because the light always applauds its entrance.',
  yeti: 'A walking snowball with strong opinions about central heating. Leaves fluffy footprints and denies knowing anything about them.',
};

export function caughtMonsters(caughtIds: readonly string[]) {
  return MONSTER_CATALOG.filter((monster) => caughtIds.includes(monster.modelId));
}
