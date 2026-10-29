import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BOARD,
  HOME_POSITIONS,
  OWL_START,
  advancePosition,
  getPosition,
  otherSide,
  stepsAhead,
} from '../src/game/board.js';

test('博道有 28 个唯一位置，首尾相接', () => {
  assert.equal(BOARD.track.length, 28);
  assert.equal(new Set(BOARD.track.map((point) => `${point.x},${point.y}`)).size, 28);
  assert.deepEqual(
    BOARD.track.map((point) => point.index),
    Array.from({ length: 28 }, (_, index) => index),
  );
  assert.equal(advancePosition(27, 'black', 1), 0);
  assert.equal(advancePosition(0, 'red', 1), 27);
});

test('双方各据六位，枭在己方子群中间', () => {
  for (const side of ['red', 'black']) {
    assert.equal(HOME_POSITIONS[side].length, 6);
    assert.ok(HOME_POSITIONS[side].includes(OWL_START[side]));
    assert.equal(new Set(HOME_POSITIONS[side]).size, 6);
  }
  assert.deepEqual(HOME_POSITIONS.red, [15, 16, 17, 18, 19, 20]);
  assert.deepEqual(HOME_POSITIONS.black, [1, 2, 3, 4, 5, 6]);
});

test('朱玄反向行棋，互为镜像', () => {
  assert.equal(advancePosition(10, 'red', 3), 7);
  assert.equal(advancePosition(7, 'black', 3), 10);
  assert.equal(stepsAhead(10, 7, 'red'), 3);
  assert.equal(stepsAhead(7, 10, 'black'), 3);
  assert.equal(otherSide('red'), 'black');
  assert.equal(otherSide('black'), 'red');
});

test('无效位置与非法步数会被拒绝', () => {
  assert.throws(() => getPosition(28), RangeError);
  assert.throws(() => getPosition(-1), RangeError);
  assert.throws(() => advancePosition(0, 'red', -1), RangeError);
  assert.throws(() => advancePosition(0, 'yellow', 1), RangeError);
});
