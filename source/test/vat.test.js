import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookupVatStatus, VatLookupError } from '../server/vat.js';
import { createVatChecker, vatLookupTarget, vatCheckWarning } from '../public/js/vat-check.js';

const NUMBER = 'LV40003052786';
const party = (vatNo = '') => ({ country: 'LV', regNo: '40003052786', vatNo });
const record = (Aktivs, Numurs = NUMBER) => ({ Numurs, Aktivs });
const response = (records, extra = {}) => ({ ok: true, json: async () => ({
  success: true, result: { records, total: records.length, ...extra },
}) });
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('VID API izmanto precīzu numura filtru un aktīvo ierakstu starp vēsturiskajiem', async () => {
  const result = await lookupVatStatus(party(), {
    fetchImpl: async (url, options) => {
      assert.equal(url.origin, 'https://data.gov.lv');
      assert.deepEqual(JSON.parse(url.searchParams.get('filters')), { Numurs: NUMBER });
      assert.equal(url.searchParams.get('resource_id'), '610910e9-e086-4c5b-a7ea-0a896a697672');
      assert.ok(options.signal);
      return response([record('nav'), record('ir'), record('nav')]);
    },
    now: () => new Date('2026-10-08T09:00:00Z'),
  });
  assert.equal(result.status, 'active');
  assert.equal(result.vatNo, NUMBER);
  assert.equal(result.checkedAt, '2026-10-08T09:00:00.000Z');
});

test('Esošu PVN numuru pārbauda neatkarīgi no reģistrācijas numura un adreses valsts', async () => {
  const result = await lookupVatStatus({ country: 'EE', regNo: '11111111111', vatNo: ' lv 40003052786 ' }, {
    fetchImpl: async (url) => {
      assert.deepEqual(JSON.parse(url.searchParams.get('filters')), { Numurs: NUMBER });
      return response([record('ir')]);
    },
  });
  assert.equal(result.status, 'active');
});

test('Neaktīvs un neatrasts numurs ir atšķirami; numuru neizdomā', async () => {
  const inactive = await lookupVatStatus(party(NUMBER), { fetchImpl: async () => response([record('nav')]) });
  assert.equal(inactive.status, 'inactive');
  assert.equal(inactive.vatNo, NUMBER);
  const missing = await lookupVatStatus(party(), { fetchImpl: async () => response([]) });
  assert.equal(missing.status, 'not_found');
  assert.equal(missing.vatNo, null);
});

test('VID kļūmes, nezināmu statusu, nepareizu numuru un nepilnus rezultātus nepasniedz kā neaktīvu', async () => {
  const implementations = [
    async () => ({ ok: false }),
    async () => { throw new Error('network'); },
    async () => ({ ok: true, json: async () => { throw new Error('html'); } }),
    async () => ({ ok: true, json: async () => ({ success: false }) }),
    async () => response([record('jā')]),
    async () => response([record('ir', 'LV00000000000')]),
    async () => response([], { total: 101 }),
    async () => response([], { total_was_estimated: true }),
    async () => response([], { total: undefined }),
  ];
  for (const fetchImpl of implementations) {
    await assert.rejects(lookupVatStatus(party(), { fetchImpl }), (err) => err instanceof VatLookupError && err.status === 502);
  }
  await assert.rejects(lookupVatStatus(party(), {
    timeoutMs: 5,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
      const keepAlive = setTimeout(() => reject(new Error('test timeout')), 1000);
      signal.addEventListener('abort', () => { clearTimeout(keepAlive); reject(signal.reason); }, { once: true });
    }),
  }), (err) => err.status === 504);
});

test('Nederīgus un ārvalstu identifikatorus nenosūta Latvijas reģistram', async () => {
  const fetchImpl = async () => { assert.fail('Nedrīkst veikt pieprasījumu'); };
  for (const input of [party('LV12'), party("LV40003052786' or 1=1"), { country: 'LV', regNo: '123' }]) {
    await assert.rejects(lookupVatStatus(input, { fetchImpl }), (err) => err.status === 400);
  }
  assert.deepEqual(await lookupVatStatus({ ...party(), country: 'LT' }, { fetchImpl }), { status: 'unsupported' });
  assert.deepEqual(await lookupVatStatus(party('EE123456789'), { fetchImpl }), { status: 'unsupported' });
  assert.deepEqual(vatLookupTarget(party()), { number: NUMBER });
});

test('Abām pusēm tukšu PVN lauku aizpilda tikai no apstiprinātas aktīvas atbildes', async () => {
  const filled = [];
  const checker = createVatChecker({ lookup: async () => ({ status: 'active', vatNo: NUMBER }), onAutofill: (role) => filled.push(role) });
  for (const role of ['seller', 'buyer']) {
    const input = party();
    checker.schedule(role, input, { immediate: true });
    await tick();
    assert.equal(input.vatNo, NUMBER);
    assert.equal(checker.get(role).autofilled, true);
    assert.equal(vatCheckWarning(input, checker.get(role)), null);
  }
  assert.deepEqual(filled, ['seller', 'buyer']);
  checker.reset();
});

test('Esošu numuru nepārraksta un neaktīva vai neatrasta numura brīdinājumu saglabā', async () => {
  for (const status of ['active', 'inactive', 'not_found']) {
    for (const existing of ['', 'lv 40003052786']) {
      const input = party(existing);
      const checker = createVatChecker({ lookup: async () => ({ status, vatNo: status === 'not_found' ? null : NUMBER }) });
      checker.schedule('seller', input, { immediate: true });
      await tick();
      assert.equal(input.vatNo, !existing && status === 'active' ? NUMBER : existing);
      assert.equal(Boolean(vatCheckWarning(input, checker.get('seller'))), Boolean(existing && status !== 'active'));
      checker.reset();
    }
  }
});

test('Partnera maiņa, manuāla PVN ievade un jauns rēķins aptur vecās atbildes', async () => {
  for (const change of ['regNo', 'vatNo', 'country', 'newInvoice']) {
    const pending = deferred();
    let signal;
    const checker = createVatChecker({ lookup: async (_input, requestSignal) => { signal = requestSignal; return pending.promise; } });
    const input = party();
    checker.schedule('buyer', input, { immediate: true });
    if (change === 'newInvoice') checker.reset();
    else {
      input[change] = { regNo: '123', vatNo: 'EE123456789', country: 'EE' }[change];
      checker.schedule('buyer', input);
    }
    assert.equal(signal.aborted, true);
    pending.resolve({ status: 'active', vatNo: NUMBER });
    await tick();
    assert.equal(input.vatNo, change === 'vatNo' ? 'EE123456789' : '');
    checker.reset();
  }
});

test('Pārklājošies pieprasījumi: tikai jaunākā atbilde maina statusu', async () => {
  const requests = [deferred(), deferred()];
  let count = 0;
  const input = party();
  const checker = createVatChecker({ lookup: () => requests[count++].promise });
  checker.schedule('seller', input, { immediate: true });
  checker.schedule('seller', input, { force: true, immediate: true });
  requests[1].resolve({ status: 'inactive', vatNo: NUMBER });
  await tick();
  requests[0].resolve({ status: 'active', vatNo: NUMBER });
  await tick();
  assert.equal(checker.get('seller').status, 'inactive');
  assert.equal(input.vatNo, '');
  checker.reset();
});

test('Ievades notikumus apvieno; kļūmi var pārbaudīt atkārtoti', async () => {
  let count = 0;
  const checker = createVatChecker({ delay: 5, lookup: async () => {
    count += 1;
    if (count === 1) throw new Error('VID nav pieejams');
    return { status: 'active', vatNo: NUMBER };
  } });
  const input = party();
  checker.schedule('seller', input);
  checker.schedule('seller', input);
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(count, 1);
  assert.equal(checker.get('seller').status, 'error');
  assert.equal(input.vatNo, '');
  checker.schedule('seller', input, { force: true, immediate: true });
  await tick();
  assert.equal(count, 2);
  assert.equal(input.vatNo, NUMBER);
  checker.reset();
});

test('Neatbilstošu PVN atbildi nepieņem; aktīva numura neatbilstību reģistrācijas numuram rāda', async () => {
  const input = party();
  const checker = createVatChecker({ lookup: async () => ({ status: 'active', vatNo: 'LV11111111111' }) });
  checker.schedule('buyer', input, { immediate: true });
  await tick();
  assert.equal(checker.get('buyer').status, 'error');
  assert.equal(input.vatNo, '');
  checker.reset();
  const mismatch = { ...party(NUMBER), regNo: '11111111111' };
  const other = createVatChecker({ lookup: async () => ({ status: 'active', vatNo: NUMBER }) });
  other.schedule('buyer', mismatch, { immediate: true });
  await tick();
  assert.match(vatCheckWarning(mismatch, other.get('buyer')), /atšķiras/);
  mismatch.regNo = '22222222222';
  assert.equal(vatCheckWarning(mismatch, other.get('buyer')), null);
  other.reset();
});
