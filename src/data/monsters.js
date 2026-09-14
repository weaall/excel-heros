// Monsters are spreadsheet errors. One type per Phase (10 stages), cycling.
export const MONSTERS = [
  { id: 'ref',     name: '#REF! Error',         shape: 'diamond', palette: { M: '#e74c3c', E: '#ffffff', O: '#7b241c' } },
  { id: 'circ',    name: 'Circular Reference',  shape: 'blob',    palette: { M: '#3498db', E: '#ffffff', O: '#1b4f72' } },
  { id: 'merged',  name: 'Merged Cell',         shape: 'cube',    palette: { M: '#95a5a6', E: '#2c3e50', O: '#4d5656' } },
  { id: 'link',    name: 'Broken Link',         shape: 'blob',    palette: { M: '#f39c12', E: '#ffffff', O: '#7e5109' } },
  { id: 'macro',   name: 'Macro Virus',         shape: 'diamond', palette: { M: '#8e44ad', E: '#f1c40f', O: '#4a235a' } },
  { id: 'corrupt', name: 'Corrupt File',        shape: 'cube',    palette: { M: '#2c3e50', E: '#e74c3c', O: '#0b0f14' } },
  { id: 'div0',    name: '#DIV/0! Error',       shape: 'diamond', palette: { M: '#16a085', E: '#ffffff', O: '#0b5345' } },
  { id: 'na',      name: '#N/A Error',          shape: 'blob',    palette: { M: '#7f8c8d', E: '#ecf0f1', O: '#2c3e50' } },
];

export const BOSS = { id: 'boss', name: 'Emergency Ticket', shape: 'ticket', palette: { M: '#c0392b', E: '#f9e79f', O: '#641e16', T: '#ffffff' } };

export function monsterForStage(stage) {
  const phase = Math.floor((Math.max(1, stage) - 1) / 10);
  return MONSTERS[phase % MONSTERS.length];
}
