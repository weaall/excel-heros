// Hand-pixelled hero base (32x32, facing RIGHT). Reference look: two-head chibi with a big soft
// hair mass (darker specks), horizontal bar eyes, tiny body, small hands. No black outlines —
// the renderer adds a dark version of each neighbouring colour.
// Keys: H hair · h hair speck · S skin · s skin shade · I iris · J iris light · B tunic · b tunic speck
//       P legs · O shoes · L white · A accent · a accent dark · W weapon · w weapon dark · G light grey · g grey

export const BODY_IDLE = [
  '................................', // 0
  '................................', // 1
  '.........HHHHHHHHHH.............', // 2
  '.......HHHHHHHHHHHHHH...........', // 3
  '......HHHHhHHHHHHHHHHH..........', // 4
  '.....HHHHHHHHHHHHHHHHHH.........', // 5
  '.....HhHHHHHHhHHHHHHHHHH........', // 6
  '....HHHHHHHHHHHHHHHHHHHHH.......', // 7
  '....HHHHHHHHHHHHhHHHHHHHH.......', // 8
  '....HHHhHHHHHHHHHHHHHHHHH.......', // 9
  '....HHHHHHHHHSSHHHHSSHHHH.......', // 10 bangs
  '....HHHHHHHSSSSSSSSSSSSHH.......', // 11
  '....HHHHHHSSJIISSSJIIISH........', // 12 eyes (bars)
  '.....HHHHHSSIIISSSIIIISH........', // 13
  '.....HHHHHSSSSSSSSSSSSSS........', // 14
  '......HHHHSSSSSSSSSSSSS.........', // 15
  '......HHHHSSSSSSSssSSS..........', // 16 mouth
  '.......HHhsSSSSSSSSSSS..........', // 17
  '.........ssSSSSSSSSs............', // 18 chin / neck
  '..........BBBBBBBBB.............', // 19 shoulders
  '.........bBBBBbBBBBBB...........', // 20
  '.........BBbBBBBBBbBB...........', // 21
  '.........sBBBBBBBBBBS...........', // 22 back hand (s) · front hand (S)
  '..........BBBBBbBBBB............', // 23
  '..........bBBBBBBBBb............', // 24
  '..........BBbBBBBBBB............', // 25
  '..........bBBBBBBbBb............', // 26
  '...........PPP..PPP.............', // 27
  '...........PPP..PPP.............', // 28
  '..........OOOO..OOOO............', // 29
  '..........OOOO..OOOO............', // 30
  '................................', // 31
];

/** Leg + shoe variants replacing rows 27..30. */
export const LEGS = {
  walkA: [
    '.........PPP......PPP...........',
    '........PPP........PPP..........',
    '.......OOOO........OOOO.........',
    '.......OOOO........OOOO.........',
  ],
  walkB: [
    '............PPPPPP..............',
    '.............PPPP...............',
    '............OOOOOO..............',
    '............OOOOOO..............',
  ],
};

/** Front-arm variants (stamped over the body; the idle front arm is baked into BODY_IDLE). */
export const ARM = {
  // raised toward the upper right; hand ends at (23..24, 10..11)
  raise: { x: 19, y: 10, rows: ['....SS', '....SS', '...BB.', '...BB.', '..BB..', '..BB..', '.BB...', 'BB....'] },
  // thrust forward; hand ends at (27..28, 20..21)
  strike: { x: 20, y: 20, rows: ['BBBBBBBSS', 'BBBBBbBSS'] },
};

/** Hair style overlays. The base already carries the "short" mass; styles add or reshape. */
export const HAIR = {
  long: { x: 4, y: 12, rows: ['HH', 'HH', 'Hh', 'HH', 'HH', 'hH', 'HH', 'HH', '.H', '.H'] },
  bob: { x: 4, y: 12, rows: ['HH', 'HH', 'Hh', 'HH', 'HH'] },
  bun: { x: 3, y: 2, rows: ['.HHH.', 'HHHHH', 'HhHHH', 'HHHHH', '.HHH.'] },
  spiky: { x: 6, y: 0, rows: ['..H....H....H....H.', '.HH...HH...HHH..HH.', 'HHH..HHH..HHHH.HHHH'] },
  side: { x: 13, y: 8, rows: ['HHHHHHH.....', '..HHHHHHHH..', '.....HHHHHHH', '........HHHH'] },
  curly: { x: 3, y: 1, rows: ['....HH..HH..HH..HH.....', '..HHHHHHHHHHHHHHHHHH...', '.HHHHHHHHHHHHHHHHHHHHH.', 'HH....................HH'] },
  cap: { x: 4, y: 0, rows: ['.......AAAAAAAA......', '.....AAAAAaAAAAAA....', '....AAAAAAAAAAAAAA...', '...AAAAAAAAAAAAAAAAAAAAA', '..aaaaaaaaaaaaaaaaaaaaaa'] },
};
