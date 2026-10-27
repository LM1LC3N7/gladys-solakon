import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IndexGuard } from '../src/guard.js';

const H = 3_600_000;

test('the counter guard: never 0, a drop and a jump held, the margin per hour', () => {
  const g = new IndexGuard({ value: 100, at: 0 }, null, 0);
  assert.equal(g.accept(0, H), false);
  assert.equal(g.accept(-1, H), false);
  assert.equal(g.accept(99, H), false);
  assert.equal(g.held.direction, 'down');
  assert.equal(new IndexGuard(undefined, null, 0).accept(0, H), false, 'never 0, even first');
  const rise = new IndexGuard({ value: 100, at: 0 }, null, 0);
  assert.equal(rise.accept(104, H), true, 'within 5 kWh per hour');
  assert.equal(rise.accept(200, 2 * H), false);
  assert.equal(rise.held.direction, 'up');
});
