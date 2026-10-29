/**
 * 本地人机对手。
 *
 * 设计原则：AI 不生成“看起来合法”的着法，只从 getLegalMoves() 的结果中
 * 评分挑选。这样即使以后修改规则引擎，电脑也不会绕开合法行动判定。
 */

import {
  BOARD,
  SIDES,
  advancePosition,
  otherSide,
} from './board.js';
import { getLegalMoves } from './engine.js';

function threatDistance(from, to, side) {
  const raw = (to - from) * (side === 'red' ? -1 : 1);
  return ((raw % BOARD.trackSize) + BOARD.trackSize) % BOARD.trackSize;
}

function activePieces(state, side) {
  return state.pieces.filter((piece) => piece.alive && piece.side === side);
}

export function evaluateMove(state, move, side = state.currentPlayer) {
  if (!move) return -Infinity;
  if (move.capturesOwl) return 1_000_000;

  const enemy = otherSide(side);
  const ownPieces = activePieces(state, side);
  const enemyPieces = activePieces(state, enemy);
  const ownOwl = ownPieces.find((piece) => piece.type === 'owl');
  const enemyOwl = enemyPieces.find((piece) => piece.type === 'owl');
  const capturedId = move.capture?.pieceId ?? null;

  let score = 0;

  if (move.capture) {
    score += move.capture.type === 'owl' ? 1_000_000 : 520;
    score += move.capture.type === 'scatter' ? 16 : 0;
  }

  if (!enemyOwl || !ownOwl) return score;

  // 行棋后己方棋子的位置。
  const afterOwn = ownPieces.map((piece) => ({
    ...piece,
    pos: piece.id === move.pieceId ? move.to : piece.pos,
  }));
  const afterEnemy = enemyPieces.filter((piece) => piece.id !== capturedId);

  // 进攻：下一回合有一定概率直接杀枭。接近敌枭的棋子更有价值。
  let attackPotential = 0;
  for (const piece of afterOwn) {
    const distance = threatDistance(piece.pos, enemyOwl.pos, side);
    if (distance >= 1 && distance <= 6) {
      attackPotential += (7 - distance) * 6;
    }
  }
  score += attackPotential;

  // 防守：己方枭若暴露在敌子 1—6 步范围内，要付出代价。
  let owlDanger = 0;
  for (const piece of afterEnemy) {
    const distance = threatDistance(piece.pos, afterOwn.find((p) => p.id === ownOwl.id).pos, enemy);
    if (distance >= 1 && distance <= 6) {
      owlDanger += (7 - distance) * 5;
    }
  }
  score -= owlDanger;

  // 谨慎奖励把枭主动送到敌子附近；枭更适合在有掩护时行动。
  if (move.pieceId === ownOwl.id) {
    score += 4;
  }

  // 轻微鼓励向前推进，减少同一子反复徘徊的观感。
  const forward = advancePosition(move.from, side, 1);
  if (move.to === forward) score += 0.5;

  // 稳定但细微的扰动，避免所有平局着法都固定选第一子。
  const idNoise = [...move.pieceId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  score += (idNoise % 7) * 0.01;

  return score;
}

/**
 * @param {ReturnType<import('./engine.js').createGame>} state
 * @returns {object|null} 规则引擎认定的合法着法之一；无棋可走时为 null
 */
export function chooseMove(state) {
  if (!state || state.phase !== 'await-move') return null;
  const side = state.currentPlayer;
  if (!SIDES.includes(side)) return null;

  const moves = getLegalMoves(state);
  if (moves.length === 0) return null;

  let best = null;
  let bestScore = -Infinity;
  for (const move of moves) {
    const score = evaluateMove(state, move, side);
    if (score > bestScore) {
      best = move;
      bestScore = score;
    }
  }
  return best;
}
