import test from 'node:test';
import assert from 'node:assert/strict';

import { chooseMove, evaluateMove } from '../src/game/ai.js';
import {
  applyMove,
  createGame,
  getLegalMoves,
  passTurn,
  rollForCurrentPlayer,
} from '../src/game/engine.js';
import { createSeededRandom } from '../src/game/dice.js';

function fixedRandomSticks(whites) {
  const values = Array.from({ length: 6 }, (_, index) => (index < whites ? 0.9 : 0.1));
  let cursor = 0;
  return () => values[cursor++ % values.length];
}

function placePieces(state, positions) {
  for (const [pieceId, position] of Object.entries(positions)) {
    const piece = state.pieces.find((candidate) => candidate.id === pieceId);
    assert.ok(piece);
    piece.pos = position;
  }
  return state;
}

test('无棋可走时 AI 返回 null，不虚构着法', () => {
  const game = createGame();
  const rolled = rollForCurrentPlayer(game, fixedRandomSticks(0));
  assert.equal(chooseMove(rolled), null);
});

test('AI 能识别并优先执行杀枭', () => {
  const game = createGame();
  game.currentPlayer = 'black';
  game.phase = 'await-roll';
  placePieces(game, {
    'black-owl': 3,
    'black-scatter-1': 20,
    'black-scatter-2': 1,
    'black-scatter-3': 2,
    'black-scatter-4': 4,
    'black-scatter-5': 5,
    'red-owl': 24,
    'red-scatter-1': 15,
    'red-scatter-2': 16,
    'red-scatter-3': 17,
    'red-scatter-4': 19,
    'red-scatter-5': 25,
  });
  const rolled = rollForCurrentPlayer(game, fixedRandomSticks(4));
  const move = chooseMove(rolled);
  assert.ok(move);
  assert.equal(move.capturesOwl, true);
  assert.ok(getLegalMoves(rolled).some((legal) => legal.pieceId === move.pieceId && legal.to === move.to));
  assert.ok(evaluateMove(rolled, move) > 1000);
});

test('AI 对 AI 的 20 局模拟都能在规则限制内结束', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    let game = createGame({ mode: 'pve' });
    const random = createSeededRandom(seed * 3331);
    let guard = 0;

    while (game.phase !== 'game-over' && guard < 400) {
      guard += 1;
      if (game.phase === 'await-roll') {
        game = rollForCurrentPlayer(game, random);
      } else if (game.phase === 'await-pass') {
        game = passTurn(game);
      } else {
        const move = chooseMove(game);
        assert.ok(move);
        game = applyMove(game, move.pieceId, move.to);
      }
    }

    assert.equal(game.phase, 'game-over', `第 ${seed} 局未能在上限内结束`);
    assert.ok(['capture-owl', 'score-limit', 'draw-limit'].includes(game.winReason));
  }
});

test('AI 在大量随机局面中只返回合法着法', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const random = createSeededRandom(seed * 977 + 13);
    let game = createGame({ mode: 'pve' });
    let checkedBlack = 0;

    while (game.phase !== 'game-over' && game.plies < 40) {
      if (game.phase === 'await-roll') {
        game = rollForCurrentPlayer(game, random);
        continue;
      }
      if (game.phase === 'await-pass') {
        if (game.currentPlayer === 'black') {
          assert.equal(chooseMove(game), null);
          checkedBlack += 1;
        }
        game = passTurn(game);
        continue;
      }

      if (game.currentPlayer === 'black') {
        const legal = getLegalMoves(game);
        const move = chooseMove(game);
        assert.ok(move, '有合法着法时 AI 不应返回 null');
        assert.ok(
          legal.some((candidate) => candidate.pieceId === move.pieceId && candidate.to === move.to),
          'AI 着法必须出现在规则引擎合法着法列表中',
        );
        checkedBlack += 1;
        game = applyMove(game, move.pieceId, move.to);
      } else {
        const legal = getLegalMoves(game);
        const move = legal[Math.floor(random() * legal.length)];
        game = applyMove(game, move.pieceId, move.to);
      }
    }
    assert.ok(checkedBlack > 0, `第 ${seed} 局没有轮到 AI`);
  }
});
