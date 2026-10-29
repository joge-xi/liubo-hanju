/**
 * 博局几何与行棋位置。
 *
 * 注意：考古所见博局并没有留下明确、唯一的行棋路线。本文件的 28 位环形
 * “博道”是为网页对局建立的现代可玩几何，不代表汉代原制。绘制时保留
 * 博局常见的中心方框、T/L/V 类纹样，但行棋点与路线属于本作设定。
 */

const TRACK_SIZE = 28;

function createTrack() {
  const points = [];
  const add = (x, y, zone) => points.push(Object.freeze({ index: points.length, x, y, zone }));

  add(150, 150, '西北角');
  for (let i = 0; i < 6; i += 1) add(250 + i * 100, 150, '北');
  add(850, 150, '东北角');
  for (let i = 0; i < 6; i += 1) add(850, 250 + i * 100, '东');
  add(850, 850, '东南角');
  for (let i = 0; i < 6; i += 1) add(750 - i * 100, 850, '南');
  add(150, 850, '西南角');
  for (let i = 0; i < 6; i += 1) add(150, 750 - i * 100, '西');

  if (points.length !== TRACK_SIZE) {
    throw new Error(`博道初始化失败：期望 ${TRACK_SIZE} 位，得到 ${points.length} 位`);
  }
  return Object.freeze(points);
}

export const SIDES = Object.freeze(['red', 'black']);

export const HOME_POSITIONS = Object.freeze({
  // 朱方居南，朝逆时针方向行棋。
  red: Object.freeze([15, 16, 17, 18, 19, 20]),
  // 玄方居北，朝顺时针方向行棋。
  black: Object.freeze([1, 2, 3, 4, 5, 6]),
});

export const OWL_START = Object.freeze({
  red: 18,
  black: 3,
});

export const DIRECTIONS = Object.freeze({
  red: -1,
  black: 1,
});

export const SIDE_LABELS = Object.freeze({
  red: '朱方',
  black: '玄方',
});

export const SIDE_SEALS = Object.freeze({
  red: '朱',
  black: '玄',
});

export const BOARD = Object.freeze({
  size: 1000,
  trackSize: TRACK_SIZE,
  track: createTrack(),
  center: Object.freeze({ x: 500, y: 500 }),
  homePositions: HOME_POSITIONS,
  owlStart: OWL_START,
  directions: DIRECTIONS,
  labels: SIDE_LABELS,
  seals: SIDE_SEALS,
  // 仅用于 SVG 的视觉边界；不是历史测量值。
  visualFrame: Object.freeze({ x: 88, y: 88, size: 824 }),
  routeFrame: Object.freeze({ x: 150, y: 150, size: 700 }),
});

export function isValidPosition(position) {
  return Number.isInteger(position) && position >= 0 && position < TRACK_SIZE;
}

export function getPosition(position) {
  if (!isValidPosition(position)) throw new RangeError(`无效博道位置：${position}`);
  return BOARD.track[position];
}

export function normalizePosition(position) {
  return ((position % TRACK_SIZE) + TRACK_SIZE) % TRACK_SIZE;
}

/**
 * 按某方行棋方向前进。
 * @param {number} from 起点索引
 * @param {'red'|'black'} side 行棋方
 * @param {number} steps 步数
 */
export function advancePosition(from, side, steps) {
  if (!isValidPosition(from)) throw new RangeError(`无效博道位置：${from}`);
  if (!SIDES.includes(side)) throw new RangeError(`未知行棋方：${side}`);
  if (!Number.isInteger(steps) || steps < 0) throw new RangeError(`无效步数：${steps}`);
  return normalizePosition(from + DIRECTIONS[side] * steps);
}

/**
 * 从 from 沿 side 的行棋方向到 to 需要几步，范围 0..27。
 */
export function stepsAhead(from, to, side) {
  const raw = (to - from) * DIRECTIONS[side];
  return normalizePosition(raw);
}

export function getHomePositions(side) {
  if (!SIDES.includes(side)) throw new RangeError(`未知行棋方：${side}`);
  return HOME_POSITIONS[side];
}

export function otherSide(side) {
  if (!SIDES.includes(side)) throw new RangeError(`未知行棋方：${side}`);
  return side === 'red' ? 'black' : 'red';
}
