import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyThrow,
  createSeededRandom,
  throwSticks,
} from '../src/game/dice.js';

test('六箸全白得到 6 点、六白彩', () => {
  const result = throwSticks(() => 0.99);
  assert.equal(result.sticks.length, 6);
  assert.equal(result.whiteCount, 6);
  assert.equal(result.pips, 6);
  assert.equal(result.special, 'six-white');
  assert.equal(result.bonus, 1);
});

test('六箸全黑得到 0 点，须过手', () => {
  const result = throwSticks(() => 0.01);
  assert.equal(result.whiteCount, 0);
  assert.equal(result.special, 'all-dark');
  assert.equal(result.pips, 0);
  assert.equal(result.bonus, 0);
});

test('五白被识别为特殊结果', () => {
  const values = [0.99, 0.99, 0.99, 0.99, 0.99, 0.01];
  let index = 0;
  const result = throwSticks(() => values[index++]);
  assert.equal(result.whiteCount, 5);
  assert.equal(result.special, 'five-white');
  assert.equal(result.label, '五白');
});

test('投掷随机数可注入、可复现', () => {
  const first = throwSticks(createSeededRandom(20261028));
  const second = throwSticks(createSeededRandom(20261028));
  assert.deepEqual(first, second);
});

test('分类函数覆盖普通结果', () => {
  const result = classifyThrow(3);
  assert.equal(result.label, '3白');
  assert.equal(result.special, null);
  assert.equal(result.bonus, 0);
});
