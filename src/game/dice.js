/**
 * 六箸投掷。
 *
 * 文献证据：
 * - 《说文解字》：“博，局戏也。六箸十二棊也。”说明博戏使用六根箸与十二枚棋。
 * - 《楚辞·招魂》：“成枭而牟，呼五白些。”说明“白”是投掷结果的一种计数，
 *   且“五白”是值得呼喊的结果。
 *
 * 不确定性：六箸具体如何计步、五白是否有额外奖励，传世文献没有给出可直接
 * 执行的完整规则。本实现以“每根箸两面、投后数白面”为可玩解释；五白/六白
 * 的加分属于现代设定，界面会明确标注。
 */

export const STICK_COUNT = 6;

export function classifyThrow(whiteCount) {
  if (whiteCount === 6) {
    return {
      special: 'six-white',
      label: '六白',
      shout: '六白！',
      bonus: 1,
    };
  }
  if (whiteCount === 5) {
    return {
      special: 'five-white',
      label: '五白',
      shout: '呼五白！',
      bonus: 1,
    };
  }
  if (whiteCount === 0) {
    return {
      special: 'all-dark',
      label: '全黑',
      shout: '无白',
      bonus: 0,
    };
  }
  return {
    special: null,
    label: `${whiteCount}白`,
    shout: '',
    bonus: 0,
  };
}

/**
 * 投六箸。random 可注入，返回序列中 >= 0.5 视为白面。
 * @param {() => number} random
 */
export function throwSticks(random = Math.random) {
  if (typeof random !== 'function') throw new TypeError('random 必须是函数');

  const sticks = Array.from({ length: STICK_COUNT }, () => {
    const value = Number(random());
    if (!Number.isFinite(value)) throw new TypeError('random 必须返回有限数值');
    return value >= 0.5 ? 'white' : 'dark';
  });
  const whiteCount = sticks.filter((face) => face === 'white').length;
  const classification = classifyThrow(whiteCount);

  return Object.freeze({
    sticks: Object.freeze(sticks),
    whiteCount,
    pips: whiteCount,
    ...classification,
  });
}

export function createSeededRandom(seed) {
  let value = Number(seed) >>> 0;
  if (value === 0) value = 0x9e3779b9;
  return function mulberry32() {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
