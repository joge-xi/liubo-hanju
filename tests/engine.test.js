import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RuleError,
  applyMove,
  createGame,
  getLegalMoves,
  getMatchResult,
  getPhaseLabel,
  isLegalMove,
  passTurn,
  rollForCurrentPlayer,
} from '../src/game/engine.js';
import { createSeededRandom } from '../src/game/dice.js';
import { RULESET } from '../src/game/ruleset.js';

function fixedRandomSticks(whites) {
  const values = Array.from({ length: 6 }, (_, index) => (index < whites ? 0.9 : 0.1));
  let cursor = 0;
  return () => values[cursor++ % values.length];
}

function placePieces(state, positions) {
  for (const [pieceId, position] of Object.entries(positions)) {
    const piece = state.pieces.find((candidate) => candidate.id === pieceId);
    assert.ok(piece, `缺少棋子 ${pieceId}`);
    piece.pos = position;
  }
  return state;
}

function redTurnWithPips(state, pips) {
  state.currentPlayer = 'red';
  state.phase = 'await-roll';
  return rollForCurrentPlayer(state, fixedRandomSticks(pips));
}

test('开新局：十二棋、双方各六、各有一枭、位置无重叠', () => {
  const game = createGame();
  assert.equal(game.phase, 'await-roll');
  assert.equal(game.currentPlayer, 'red');
  assert.equal(game.pieces.length, 12);
  assert.equal(game.pieces.filter((piece) => piece.side === 'red').length, 6);
  assert.equal(game.pieces.filter((piece) => piece.side === 'black').length, 6);
  assert.equal(game.pieces.filter((piece) => piece.type === 'owl').length, 2);
  assert.equal(
    new Set(game.pieces.filter((piece) => piece.alive).map((piece) => piece.pos)).size,
    12,
  );
  assert.equal(game.scores.red, 0);
  assert.equal(game.scores.black, 0);
  assert.equal(game.log.length, 1);
});

test('未投箸不能行棋，非法着法被拒绝', () => {
  const game = createGame();
  assert.throws(() => applyMove(game, 'red-scatter-1', 14), RuleError);
});

test('投箸后只产生精确步数的合法着法', () => {
  const game = createGame();
  const rolled = redTurnWithPips(game, 1);
  assert.equal(rolled.phase, 'await-move');
  assert.equal(rolled.roll.pips, 1);
  assert.equal(rolled.sticks.length, 6);

  const moves = getLegalMoves(rolled);
  assert.equal(moves.length, 1);
  assert.deepEqual(
    { pieceId: moves[0].pieceId, from: moves[0].from, to: moves[0].to },
    { pieceId: 'red-scatter-1', from: 15, to: 14 },
  );
});

test('不能落在己方子上，不能冒用敌方棋子', () => {
  const game = createGame();
  const rolled = redTurnWithPips(game, 1);
  assert.equal(isLegalMove(rolled, 'red-owl', 17), false);
  assert.throws(() => applyMove(rolled, 'red-owl', 17), RuleError);
  assert.throws(() => applyMove(rolled, 'black-owl', 2), RuleError);
});

test('合法移动后切换行棋方并重置投掷状态，原状态不被修改', () => {
  const game = createGame();
  const rolled = redTurnWithPips(game, 1);
  const snapshot = structuredClone(rolled);
  const moved = applyMove(rolled, 'red-scatter-1', 14);

  assert.equal(moved.currentPlayer, 'black');
  assert.equal(moved.round, 1);
  assert.equal(moved.plies, 1);
  assert.equal(moved.phase, 'await-roll');
  assert.equal(moved.roll, null);
  assert.deepEqual(moved.sticks, []);
  assert.equal(
    moved.pieces.find((piece) => piece.id === 'red-scatter-1').pos,
    14,
  );
  assert.deepEqual(rolled, snapshot);
  assert.equal(getPhaseLabel(moved), '玄方当投箸');
});

test('精确落子吃散子，加 1 筹并继续对局', () => {
  const game = createGame();
  placePieces(game, {
    'red-owl': 20,
    'red-scatter-1': 21,
    'red-scatter-2': 22,
    'red-scatter-3': 23,
    'red-scatter-4': 24,
    'red-scatter-5': 25,
    'black-owl': 27,
    'black-scatter-1': 16,
    'black-scatter-2': 1,
    'black-scatter-3': 2,
    'black-scatter-4': 4,
    'black-scatter-5': 5,
  });
  const rolled = redTurnWithPips(game, 4);
  const captureMove = getLegalMoves(rolled).find((move) => move.capturesOwl === false && move.capture);
  assert.ok(captureMove);
  assert.equal(captureMove.to, 16);

  const moved = applyMove(rolled, captureMove.pieceId, captureMove.to);
  const captured = moved.pieces.find((piece) => piece.id === 'black-scatter-1');
  assert.equal(captured.alive, false);
  assert.equal(captured.capturedBy, 'red');
  assert.equal(moved.captures.red, 1);
  assert.equal(moved.scores.red, 1);
  assert.equal(moved.phase, 'await-roll');
  assert.equal(moved.winner, null);
});

test('擒杀枭立即获胜，不能继续行动', () => {
  const game = createGame();
  placePieces(game, {
    'red-owl': 20,
    'red-scatter-1': 21,
    'red-scatter-2': 22,
    'red-scatter-3': 23,
    'red-scatter-4': 24,
    'red-scatter-5': 25,
    'black-owl': 16,
    'black-scatter-1': 27,
    'black-scatter-2': 1,
    'black-scatter-3': 2,
    'black-scatter-4': 4,
    'black-scatter-5': 5,
  });
  const rolled = redTurnWithPips(game, 4);
  const kill = getLegalMoves(rolled).find((move) => move.capturesOwl);
  assert.ok(kill);

  const over = applyMove(rolled, kill.pieceId, kill.to);
  assert.equal(over.phase, 'game-over');
  assert.equal(over.winner, 'red');
  assert.equal(over.winReason, 'capture-owl');
  assert.equal(over.pieces.find((piece) => piece.id === 'black-owl').alive, false);
  assert.equal(getMatchResult(over).title, '朱方杀枭');
  assert.throws(() => applyMove(over, 'red-scatter-1', 22), RuleError);
});

test('全黑 0 点进入过手阶段，过手后切换行棋方', () => {
  const game = createGame();
  const rolled = rollForCurrentPlayer(game, fixedRandomSticks(0));
  assert.equal(rolled.phase, 'await-pass');
  assert.equal(rolled.roll.pips, 0);
  assert.deepEqual(getLegalMoves(rolled), []);
  assert.throws(() => passTurn(createGame()), RuleError);

  const passed = passTurn(rolled);
  assert.equal(passed.currentPlayer, 'black');
  assert.equal(passed.plies, 1);
  assert.equal(passed.phase, 'await-roll');
});

test('仍有合法着法时不能过手', () => {
  const game = createGame();
  const rolled = redTurnWithPips(game, 1);
  assert.equal(rolled.phase, 'await-move');
  assert.throws(() => passTurn(rolled), RuleError);
});

test('五白/六白触发彩分，但该分是现代规则', () => {
  const game = createGame();
  const rolled = rollForCurrentPlayer(game, fixedRandomSticks(6));
  assert.equal(rolled.specials.red, 1);
  assert.equal(rolled.scores.red, RULESET.scoring.sixWhite);
  assert.ok(rolled.log.some((entry) => entry.kind === 'special'));
});

test('到达回合上限且筹数不同时，按筹数判胜', () => {
  const shortRules = structuredClone(RULESET);
  shortRules.end.maxRounds = 1;
  shortRules.end.maxPlies = 2;
  shortRules.id = 'test-score-limit';
  shortRules.version = 'test';

  let game = createGame({ ruleset: shortRules });
  placePieces(game, {
    'red-owl': 20,
    'red-scatter-1': 21,
    'red-scatter-2': 22,
    'red-scatter-3': 23,
    'red-scatter-4': 24,
    'red-scatter-5': 25,
    'black-owl': 27,
    'black-scatter-1': 16,
    'black-scatter-2': 1,
    'black-scatter-3': 2,
    'black-scatter-4': 4,
    'black-scatter-5': 5,
  });

  let rolled = redTurnWithPips(game, 4);
  const capture = getLegalMoves(rolled).find((move) => move.capture);
  game = applyMove(rolled, capture.pieceId, capture.to);
  assert.equal(game.scores.red, 1);
  assert.equal(game.currentPlayer, 'black');

  rolled = rollForCurrentPlayer(game, fixedRandomSticks(1));
  const blackMove = getLegalMoves(rolled)[0];
  game = applyMove(rolled, blackMove.pieceId, blackMove.to);

  assert.equal(game.phase, 'game-over');
  assert.equal(game.winner, 'red');
  assert.equal(game.winReason, 'score-limit');
  assert.match(getMatchResult(game).subtitle, /1 筹对 0 筹/);
});

test('到达回合上限时按筹数判定或和局', () => {
  const shortRules = structuredClone(RULESET);
  shortRules.end.maxRounds = 1;
  shortRules.end.maxPlies = 2;
  shortRules.id = 'test-short-game';
  shortRules.version = 'test';

  let game = createGame({ ruleset: shortRules });
  let rolled = rollForCurrentPlayer(game, fixedRandomSticks(1));
  game = applyMove(rolled, getLegalMoves(rolled)[0].pieceId, getLegalMoves(rolled)[0].to);
  assert.equal(game.currentPlayer, 'black');

  rolled = rollForCurrentPlayer(game, fixedRandomSticks(1));
  const move = getLegalMoves(rolled)[0];
  game = applyMove(rolled, move.pieceId, move.to);

  assert.equal(game.phase, 'game-over');
  assert.equal(game.winner, 'draw');
  assert.equal(game.winReason, 'draw-limit');
  assert.equal(getMatchResult(game).title, '和局');
});

test('三次重开都得到独立、干净的状态', () => {
  const games = [createGame(), createGame(), createGame()];
  const first = rollForCurrentPlayer(games[0], fixedRandomSticks(1));
  applyMove(first, getLegalMoves(first)[0].pieceId, getLegalMoves(first)[0].to);
  assert.equal(games[1].plies, 0);
  assert.equal(games[2].plies, 0);
  assert.equal(games[1].phase, 'await-roll');
  assert.equal(games[2].currentPlayer, 'red');
  assert.equal(games[1].pieces.every((piece) => piece.alive), true);
});

test('200 局随机推演中，合法着法始终满足精确步数与占位约束', () => {
  for (let seed = 1; seed <= 200; seed += 1) {
    let game = createGame({ mode: 'pve' });
    const random = createSeededRandom(seed * 173);
    let guard = 0;

    while (game.phase !== 'game-over' && guard < 420) {
      guard += 1;
      if (game.phase === 'await-roll') {
        game = rollForCurrentPlayer(game, random);
        continue;
      }
      if (game.phase === 'await-pass') {
        game = passTurn(game);
        continue;
      }
      const moves = getLegalMoves(game);
      assert.ok(moves.length > 0);
      const candidate = moves[Math.floor(random() * moves.length)];
      const occupant = game.pieces.find(
        (piece) => piece.alive && piece.pos === candidate.to && piece.id !== candidate.pieceId,
      );
      assert.ok(!occupant || occupant.side !== game.currentPlayer);
      game = applyMove(game, candidate.pieceId, candidate.to);
    }

    assert.ok(guard < 420, `第 ${seed} 局未能结束`);
  }
});
