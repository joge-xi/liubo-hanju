/**
 * 可配置规则版本。
 *
 * 修改规则时请同时更新：
 * 1. 本文件的版本号、更新日期和变更记录；
 * 2. src/data/museum.js 中对应的证据标签；
 * 3. tests/ 下受影响的行为测试；
 * 4. README 的“规则版本”和“复原边界”。
 */

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export const RULESET = deepFreeze({
  id: 'hanju-sha-xiao',
  name: '汉局·杀枭竞速',
  fullName: '汉局·杀枭竞速（现代可玩复原）',
  version: '1.0.0',
  releasedAt: '2026-10-28',
  status: '现代可玩复原，不是已证实的汉代原制',
  shortDescription:
    '以“六箸十二棋”“枭贵而必杀枭”等文献线索为骨架，采用 28 位环形博道、双方反向行棋、掷箸计白、杀枭取胜的完整可玩方案。',

  board: {
    trackSize: 28,
    kind: '现代二十八位环形博道（装饰性重绘 T/L/V 博局纹）',
    orientation: '朱方居南、逆时针；玄方居北、顺时针',
  },

  setup: {
    piecesPerSide: 6,
    owlsPerSide: 1,
    scattersPerSide: 5,
    totalPieces: 12,
    // 枭在己方六子中间，前后各有散子。属于现代平衡设定。
    owlStart: { red: 18, black: 3 },
    homePositions: {
      red: [15, 16, 17, 18, 19, 20],
      black: [1, 2, 3, 4, 5, 6],
    },
  },

  dice: {
    tool: '六箸',
    sticks: 6,
    faces: ['白', '黑'],
    counting: '数白面',
    minPips: 0,
    maxPips: 6,
    fiveWhiteBonus: 1,
    sixWhiteBonus: 1,
    note: '0 白可行 0 步，须过。五白/六白加 1 筹为本作现代奖励。',
  },

  movement: {
    exactRoll: true,
    mayPassOverFriendly: true,
    mayPassOverEnemy: true,
    mayLandOnFriendly: false,
    captureByExactLanding: true,
    owlAndScatterMoveAlike: true,
    moveDirection: { red: -1, black: 1 },
  },

  scoring: {
    captureScatter: 1,
    captureOwl: '立即获胜',
    fiveWhite: 1,
    sixWhite: 1,
    label: '博筹（现代计分）',
  },

  end: {
    captureOwlWins: true,
    maxRounds: 60,
    maxPlies: 120,
    scoreTiebreak: true,
    tieIsDraw: true,
    note: '杀枭立即结束；若 60 回合内无人杀枭，则比较博筹，同筹为和局。',
  },

  ai: {
    humanSide: 'red',
    computerSide: 'black',
    rule: '电脑只从规则引擎返回的合法着法中选点',
  },

  rulesEvidence: {
    track: 'modern',
    startPositions: 'modern',
    directions: 'modern',
    pieceDistribution: 'hypothesis',
    throwCounting: 'interpretation',
    fiveWhiteBonus: 'modern',
    captureByLanding: 'modern',
    captureOwlWin: 'interpretation',
    scoring: 'modern',
    roundLimit: 'modern',
  },

  changelog: [
    {
      version: '1.0.0',
      date: '2026-10-28',
      note: '首个完整可玩版本：双人、本地人机、28 位博道、六箸投掷、杀枭胜负、证据面板与自动化测试。',
    },
  ],

  knownGaps: [
    '汉代六博的完整行棋路线、起点、方向与步法没有可直接据以执行的记载。',
    '“一枭五散”是由十二棋总数和“枭”称谓推得的复原假说，不是文献明确分配。',
    '六箸如何计步、五白是否附带奖励，均无定论。',
    '吃子、计分、回合上限属于本作为了让对局可结束而设置的现代规则。',
    '已核验 CMU Liubo Lab 的公开项目说明（该页明确将行棋规则、棋盘变体、胜负条件列为未知）；其实际游戏、开发日志与海昏侯材料尚未核对。',
  ],
});

export const DEFAULT_RULESET = RULESET;
