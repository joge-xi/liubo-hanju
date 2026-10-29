/**
 * 六博·汉局规则引擎。
 *
 * 这是纯逻辑模块：不引用 DOM、不读全局随机数、不依赖浏览器 API。
 * 每次行动都返回新的 state，原 state 不会被修改，便于测试、悔棋扩展与 AI 推演。
 *
 * 规则边界见 ruleset.js 与 src/data/museum.js。尤其注意：
 * - 28 位环形博道、起点、方向、吃子、计分、回合上限均为现代可玩设定；
 * - 文献能支撑的核心是“六箸十二棋”“枭为贵”“杀枭”和“五白”等线索，
 *   而不是一套已经复原的完整汉代规则。
 */

import {
  BOARD,
  SIDES,
  SIDE_LABELS,
  SIDE_SEALS,
  advancePosition,
  otherSide,
} from './board.js';
import { throwSticks } from './dice.js';
import { RULESET } from './ruleset.js';

export class RuleError extends Error {
  constructor(message, code = 'RULE_ERROR') {
    super(message);
    this.name = 'RuleError';
    this.code = code;
  }
}

const VALID_MODES = new Set(['pvp', 'pve']);
const VALID_PHASES = new Set(['await-roll', 'await-move', 'await-pass', 'game-over']);

function assertSide(side) {
  if (!SIDES.includes(side)) throw new RuleError(`未知对弈方：${side}`, 'INVALID_SIDE');
}

function assertMode(mode) {
  if (!VALID_MODES.has(mode)) throw new RuleError(`未知对弈模式：${mode}`, 'INVALID_MODE');
}

function assertKnownPhase(state) {
  if (!state || !VALID_PHASES.has(state.phase)) {
    throw new RuleError('对局状态无效。', 'INVALID_STATE');
  }
}

function createPieces(ruleset) {
  const pieces = [];
  for (const side of SIDES) {
    const homes = ruleset.setup.homePositions[side];
    const owlPosition = ruleset.setup.owlStart[side];
    let scatterNumber = 0;

    for (const position of homes) {
      if (position === owlPosition) {
        pieces.push({
          id: `${side}-owl`,
          side,
          type: 'owl',
          name: '枭',
          pos: position,
          alive: true,
          capturedBy: null,
        });
      } else {
        scatterNumber += 1;
        pieces.push({
          id: `${side}-scatter-${scatterNumber}`,
          side,
          type: 'scatter',
          name: '散',
          pos: position,
          alive: true,
          capturedBy: null,
        });
      }
    }
  }
  return pieces;
}

function createEmptyScores() {
  return { red: 0, black: 0 };
}

function cloneState(state) {
  return {
    ...state,
    pieces: state.pieces.map((piece) => ({ ...piece })),
    scores: { ...state.scores },
    captures: { ...state.captures },
    specials: { ...state.specials },
    throws: { ...state.throws },
    sticks: [...state.sticks],
    roll: state.roll
      ? {
          ...state.roll,
          sticks: [...state.roll.sticks],
        }
      : null,
    lastMove: state.lastMove ? { ...state.lastMove } : null,
    log: state.log.map((entry) => ({ ...entry })),
  };
}

function appendLog(state, kind, text, extra = {}) {
  state.logSeq += 1;
  state.log.push({
    id: state.logSeq,
    kind,
    text,
    ...extra,
  });
  if (state.log.length > 80) {
    state.log = state.log.slice(-80);
  }
}

function posLabel(position) {
  return `第 ${position + 1} 位`;
}

function sideLabel(side) {
  return SIDE_LABELS[side] ?? side;
}

/**
 * 开新局。默认朱方先行。
 * @param {{mode?: 'pvp'|'pve', ruleset?: typeof RULESET}} options
 */
export function createGame({ mode = 'pvp', ruleset = RULESET } = {}) {
  assertMode(mode);
  if (!ruleset || !ruleset.setup || !ruleset.end) {
    throw new RuleError('规则集缺少必要配置。', 'INVALID_RULESET');
  }

  const state = {
    ruleset,
    rulesetId: ruleset.id,
    rulesetVersion: ruleset.version,
    mode,
    phase: 'await-roll',
    currentPlayer: 'red',
    round: 1,
    plies: 0,
    maxPlies: ruleset.end.maxPlies,
    pieces: createPieces(ruleset),
    scores: createEmptyScores(),
    captures: createEmptyScores(),
    specials: createEmptyScores(),
    throws: createEmptyScores(),
    sticks: [],
    roll: null,
    lastMove: null,
    winner: null,
    winReason: null,
    endDetail: '',
    log: [],
    logSeq: 0,
  };

  appendLog(state, 'system', '新局开始。朱方先行，双方以枭为贵。', {
    side: 'red',
    seal: SIDE_SEALS.red,
  });
  return state;
}

export function getActivePieces(state, side = null) {
  return state.pieces.filter((piece) => piece.alive && (!side || piece.side === side));
}

export function getPieceById(state, pieceId) {
  return state.pieces.find((piece) => piece.id === pieceId) ?? null;
}

export function getPieceAt(state, position) {
  return (
    state.pieces.find((piece) => piece.alive && piece.pos === position) ?? null
  );
}

/**
 * 返回当前掷出的点数下，当前方所有合法着法。
 * 这是 AI 与界面共用的唯一合法着法来源。
 */
export function getLegalMoves(state) {
  if (!state || state.phase === 'game-over' || !state.roll) return [];
  const side = state.currentPlayer;
  if (!SIDES.includes(side)) return [];

  const pips = state.roll.pips;
  if (!Number.isInteger(pips) || pips <= 0) return [];

  const occupied = new Map();
  for (const piece of state.pieces) {
    if (piece.alive) occupied.set(piece.pos, piece);
  }

  const moves = [];
  for (const piece of state.pieces) {
    if (!piece.alive || piece.side !== side) continue;
    const to = advancePosition(piece.pos, side, pips);
    const target = occupied.get(to) ?? null;

    if (target && target.side === side) continue;

    moves.push({
      pieceId: piece.id,
      pieceType: piece.type,
      from: piece.pos,
      to,
      pips,
      side,
      capture: target
        ? {
            pieceId: target.id,
            type: target.type,
            side: target.side,
            from: target.pos,
          }
        : null,
      capturesOwl: Boolean(target && target.type === 'owl'),
    });
  }

  return moves;
}

export function isLegalMove(state, pieceId, to) {
  return getLegalMoves(state).some(
    (move) => move.pieceId === pieceId && move.to === to,
  );
}

function finishByRoundLimit(state) {
  const { scores } = state;
  const maxRounds = state.ruleset.end.maxRounds;

  if (scores.red === scores.black) {
    state.phase = 'game-over';
    state.winner = 'draw';
    state.winReason = 'draw-limit';
    state.endDetail = `${maxRounds} 回合已满，双方各得 ${scores.red} 筹，和局。`;
    appendLog(state, 'limit', state.endDetail, { side: null, seal: '和' });
    return state;
  }

  const winner = scores.red > scores.black ? 'red' : 'black';
  state.phase = 'game-over';
  state.winner = winner;
  state.winReason = 'score-limit';
  state.endDetail = `${maxRounds} 回合已满，${sideLabel(winner)}以 ${scores[winner]} 筹对 ${scores[otherSide(winner)]} 筹胜出。`;
  appendLog(state, 'limit', state.endDetail, {
    side: winner,
    seal: SIDE_SEALS[winner],
  });
  return state;
}

function advanceTurn(state, mover) {
  state.plies += 1;
  state.round = Math.floor(state.plies / 2) + 1;

  if (state.plies >= state.ruleset.end.maxPlies) {
    return finishByRoundLimit(state);
  }

  state.currentPlayer = otherSide(mover);
  state.phase = 'await-roll';
  state.sticks = [];
  state.roll = null;
  // 保留 lastMove 供界面显示上一手；新一手落子时会被覆盖。
  return state;
}

/**
 * 当前方投掷六箸。会立即把状态推进到 await-move 或 await-pass。
 * @param {ReturnType<typeof createGame>} state
 * @param {() => number} random
 */
export function rollForCurrentPlayer(state, random = Math.random) {
  assertKnownPhase(state);
  if (state.phase !== 'await-roll') {
    throw new RuleError('现在不是投箸阶段。', 'WRONG_PHASE');
  }

  const result = throwSticks(random);
  const next = cloneState(state);
  const side = next.currentPlayer;
  const rules = next.ruleset;

  next.sticks = [...result.sticks];
  next.roll = {
    ...result,
    sticks: [...result.sticks],
  };
  next.throws[side] += 1;

  appendLog(next, 'throw', `${sideLabel(side)}投箸：${result.label}，可行 ${result.pips} 步。`, {
    side,
    seal: SIDE_SEALS[side],
  });

  if (result.special === 'five-white' || result.special === 'six-white') {
    const bonus =
      result.special === 'five-white'
        ? rules.scoring.fiveWhite
        : rules.scoring.sixWhite;
    next.scores[side] += bonus;
    next.specials[side] += 1;
    appendLog(
      next,
      'special',
      `${result.shout}${sideLabel(side)}得彩，博筹 +${bonus}（现代奖励设定）。`,
      { side, seal: SIDE_SEALS[side] },
    );
  }

  const moves = getLegalMoves(next);
  if (moves.length === 0) {
    next.phase = 'await-pass';
    appendLog(next, 'pass', '无合法落点，须过。', {
      side,
      seal: SIDE_SEALS[side],
    });
  } else {
    next.phase = 'await-move';
  }

  return next;
}

function describeMove(state, mover, move) {
  const piece = getPieceById(state, move.pieceId);
  const pieceName = piece?.type === 'owl' ? '枭' : '散';
  const subject = `${sideLabel(mover)}${pieceName}`;
  if (!move.capture) {
    return `${subject}自${posLabel(move.from)}行至${posLabel(move.to)}。`;
  }
  const targetName = move.capture.type === 'owl' ? '枭' : '散';
  return `${subject}自${posLabel(move.from)}行至${posLabel(move.to)}，擒${sideLabel(move.capture.side)}${targetName}。`;
}

/**
 * 执行一步合法着法。
 * @param {ReturnType<typeof createGame>} state
 * @param {string} pieceId
 * @param {number} to
 */
export function applyMove(state, pieceId, to) {
  assertKnownPhase(state);
  if (state.phase !== 'await-move') {
    throw new RuleError('当前不是行棋阶段。', 'WRONG_PHASE');
  }

  const legalMoves = getLegalMoves(state);
  const move = legalMoves.find(
    (candidate) => candidate.pieceId === pieceId && candidate.to === to,
  );
  if (!move) {
    throw new RuleError('此着法不合法：只能按本次点数落在空位或敌子上。', 'ILLEGAL_MOVE');
  }

  const next = cloneState(state);
  const mover = next.currentPlayer;
  const piece = getPieceById(next, pieceId);
  if (!piece || !piece.alive || piece.side !== mover) {
    throw new RuleError('该棋子不属于当前行棋方。', 'ILLEGAL_PIECE');
  }

  const captured = move.capture ? getPieceById(next, move.capture.pieceId) : null;
  piece.pos = to;
  next.lastMove = {
    side: mover,
    pieceId,
    from: move.from,
    to,
    captureType: captured ? captured.type : null,
  };

  appendLog(next, captured ? 'capture' : 'move', describeMove(state, mover, move), {
    side: mover,
    seal: SIDE_SEALS[mover],
    pieceId,
    from: move.from,
    to,
  });

  if (captured) {
    captured.alive = false;
    captured.capturedBy = mover;
    captured.pos = null;
    next.captures[mover] += 1;

    if (captured.type === 'owl') {
      next.phase = 'game-over';
      next.winner = mover;
      next.winReason = 'capture-owl';
      next.endDetail = `${sideLabel(mover)}擒杀${sideLabel(captured.side)}之枭，依“胜者必杀枭”的复原解释获胜。`;
      appendLog(next, 'win', `杀枭！${next.endDetail}`, {
        side: mover,
        seal: SIDE_SEALS[mover],
      });
      next.sticks = [];
      next.roll = null;
      return next;
    }

    next.scores[mover] += next.ruleset.scoring.captureScatter;
    appendLog(
      next,
      'score',
      `${sideLabel(mover)}得 ${next.ruleset.scoring.captureScatter} 筹（现代计分）。`,
      { side: mover, seal: SIDE_SEALS[mover] },
    );
  }

  return advanceTurn(next, mover);
}

/**
 * 在无合法落点时过手。
 */
export function passTurn(state) {
  assertKnownPhase(state);
  if (state.phase !== 'await-pass') {
    throw new RuleError('仍有合法着法或当前不是过手阶段。', 'WRONG_PHASE');
  }
  if (getLegalMoves(state).length > 0) {
    throw new RuleError('仍有合法着法，不能过手。', 'MOVES_AVAILABLE');
  }

  const next = cloneState(state);
  const mover = next.currentPlayer;
  appendLog(next, 'pass', `${sideLabel(mover)}无子可行，过手。`, {
    side: mover,
    seal: SIDE_SEALS[mover],
  });
  next.lastMove = null;
  return advanceTurn(next, mover);
}

export function isGameOver(state) {
  return state.phase === 'game-over';
}

export function getPhaseLabel(state) {
  switch (state.phase) {
    case 'await-roll':
      return `${sideLabel(state.currentPlayer)}当投箸`;
    case 'await-move':
      return `${sideLabel(state.currentPlayer)}当行棋`;
    case 'await-pass':
      return `${sideLabel(state.currentPlayer)}无子可行`;
    case 'game-over':
      if (state.winner === 'draw') return '和局';
      return `${sideLabel(state.winner)}胜`;
    default:
      return '对局中';
  }
}

export function getMatchResult(state) {
  if (!isGameOver(state)) return null;
  const scoreText = `朱 ${state.scores.red} · 玄 ${state.scores.black}`;
  if (state.winner === 'draw') {
    return {
      winner: 'draw',
      title: '和局',
      subtitle: state.endDetail,
      scoreText,
      canRestart: true,
    };
  }
  return {
    winner: state.winner,
    title:
      state.winReason === 'capture-owl'
        ? `${sideLabel(state.winner)}杀枭`
        : `${sideLabel(state.winner)}胜`,
    subtitle: state.endDetail,
    scoreText,
    canRestart: true,
  };
}

export function getBoardSummary(state) {
  const pieces = getActivePieces(state);
  return {
    red: pieces.filter((piece) => piece.side === 'red').length,
    black: pieces.filter((piece) => piece.side === 'black').length,
    trackSize: BOARD.trackSize,
  };
}

export { BOARD, SIDES, SIDE_LABELS, SIDE_SEALS };
