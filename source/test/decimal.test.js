import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDecimal, add, mul, round, percentOf, cmp, toPlainString, toDisplayString, toInputString, significantScale,
} from '../public/js/decimal.js';

const d = (text) => parseDecimal(text);

test('parseDecimal pieņem punktu, komatu un atstarpes kā tūkstošu atdalītājus', () => {
  assert.deepEqual(d('1234.56'), { n: 123456n, s: 2 });
  assert.deepEqual(d('1234,56'), { n: 123456n, s: 2 });
  assert.deepEqual(d('1 234,56'), { n: 123456n, s: 2 });
  assert.deepEqual(d('-5'), { n: -5n, s: 0 });
  assert.deepEqual(d(600), { n: 600n, s: 0 });
  assert.deepEqual(d(0.125), { n: 125n, s: 3 });
});

test('parseDecimal noraida vērtības, kas nav skaitļi', () => {
  for (const bad of ['', 'abc', '1.234,56', '1,2,3', '12a', '.5', null, undefined, NaN, Infinity]) {
    assert.equal(parseDecimal(bad), null, String(bad));
  }
});

test('aritmētika ir precīza (bez peldošā punkta kļūdām)', () => {
  assert.equal(toPlainString(add(d('0.1'), d('0.2'))), '0.3');
  assert.equal(toPlainString(mul(d('1234.567'), d('0.12345'))), '152.40729615');
  assert.equal(cmp(d('1.50'), d('1.5')), 0);
  assert.equal(cmp(d('-1'), d('0')), -1);
});

test('round noapaļo līdz centiem pusi prom no nulles', () => {
  assert.equal(toPlainString(round(d('2.835'), 2), 2), '2.84');
  assert.equal(toPlainString(round(d('2.834'), 2), 2), '2.83');
  assert.equal(toPlainString(round(d('-2.835'), 2), 2), '-2.84');
  assert.equal(toPlainString(round(d('-0.004'), 2), 2), '0.00');
  assert.equal(toPlainString(round(d('5'), 2), 2), '5.00');
});

test('percentOf aprēķina PVN summu', () => {
  assert.equal(toPlainString(percentOf(d('1677.50'), d('21')), 2), '352.28');
  assert.equal(toPlainString(percentOf(d('56.70'), d('5')), 2), '2.84');
  assert.equal(toPlainString(percentOf(d('100'), d('12.5')), 2), '12.50');
});

test('formatēšana XML, ievades laukiem un attēlošanai', () => {
  assert.equal(toPlainString(d('600'), 2), '600.00');
  assert.equal(toPlainString(d('0.12345'), 2), '0.12345');
  assert.equal(toPlainString(d('21.00')), '21');
  assert.equal(toInputString(d('12.5')), '12,5');
  assert.equal(toDisplayString(d('1234567.8')), '1 234 567,80');
  assert.equal(toDisplayString(d('-100')), '-100,00');
  assert.equal(significantScale(d('1.2300')), 2);
});
