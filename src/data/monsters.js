// Monsters are spreadsheet errors. One type per Phase (10 stages), cycling.
export const MONSTERS = [
  { id: 'ref',     name: '#REF! 오류',     shape: 'diamond', palette: { M: '#e74c3c', E: '#ffffff', O: '#7b241c', K: '#ff9f9f' } },
  { id: 'circ',    name: '순환 참조',      shape: 'blob',    palette: { M: '#3498db', E: '#ffffff', O: '#1b4f72', K: '#9fd0ff' } },
  { id: 'merged',  name: '병합된 셀',      shape: 'cube',    palette: { M: '#95a5a6', E: '#2c3e50', O: '#4d5656', K: '#f5b7b1' } },
  { id: 'link',    name: '끊어진 링크',    shape: 'blob',    palette: { M: '#f39c12', E: '#ffffff', O: '#7e5109', K: '#ffd08a' } },
  { id: 'macro',   name: '매크로 바이러스', shape: 'diamond', palette: { M: '#8e44ad', E: '#f1c40f', O: '#4a235a', K: '#d7a6ff' } },
  { id: 'corrupt', name: '손상된 파일',    shape: 'cube',    palette: { M: '#2c3e50', E: '#e74c3c', O: '#0b0f14', K: '#6c7a89' } },
  { id: 'div0',    name: '#DIV/0! 오류',   shape: 'diamond', palette: { M: '#16a085', E: '#ffffff', O: '#0b5345', K: '#a2f2dd' } },
  { id: 'na',      name: '#N/A 오류',      shape: 'blob',    palette: { M: '#7f8c8d', E: '#ecf0f1', O: '#2c3e50', K: '#f5b7b1' } },
];

export const BOSS = { id: 'boss', name: '긴급 티켓', shape: 'ticket', palette: { M: '#c0392b', E: '#f9e79f', O: '#641e16', T: '#ffffff', K: '#ff9f9f' } };

export function monsterForStage(stage) {
  const phase = Math.floor((Math.max(1, stage) - 1) / 10);
  return MONSTERS[phase % MONSTERS.length];
}
