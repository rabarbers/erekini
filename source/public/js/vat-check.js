import { compactId } from './invoice.js';

export const VID_MANUAL_URL = 'https://www6.vid.gov.lv/PVN';
export const VID_DATASET_URL = 'https://data.gov.lv/dati/lv/dataset/pvn-maksataji';

// LV prefikss ir tikai meklēšanas kritērijs. Aizpildīšanai izmanto API atgriezto numuru.
export function vatLookupTarget(party) {
  const vatNo = compactId(party.vatNo);
  const regNo = compactId(party.regNo);
  if (vatNo) {
    if (!vatNo.startsWith('LV')) return { status: 'unsupported' };
    return /^LV\d{11}$/.test(vatNo) ? { number: vatNo } : { status: 'incomplete' };
  }
  if (party.country !== 'LV') return { status: 'unsupported' };
  return /^\d{11}$/.test(regNo) ? { number: `LV${regNo}` } : { status: 'incomplete' };
}

const signature = (party) => JSON.stringify([party.country, compactId(party.regNo), compactId(party.vatNo)]);

// Pieprasījuma rezultāts drīkst mainīt tikai to pašu pusi ar tiem pašiem identifikatoriem.
export function createVatChecker({ lookup, onChange = () => {}, onAutofill = () => {}, delay = 650 }) {
  const slots = new Map();
  function cancel(role) {
    const old = slots.get(role);
    clearTimeout(old?.timer);
    old?.abort?.abort();
  }
  function schedule(role, party, { force = false, immediate = false } = {}) {
    const key = signature(party);
    const old = slots.get(role);
    if (!force && old?.party === party && old.key === key) return;
    cancel(role);
    const target = vatLookupTarget(party);
    const slot = { party, key, status: target.status ?? 'pending' };
    slots.set(role, slot);
    onChange();
    if (!target.number) return;
    const current = () => slots.get(role) === slot && signature(party) === slot.key;
    const run = async () => {
      slot.abort = new AbortController();
      slot.status = 'loading';
      onChange();
      try {
        const result = await lookup({ country: party.country, regNo: party.regNo, vatNo: party.vatNo }, slot.abort.signal);
        if (!current()) return;
        if (!['active', 'inactive', 'not_found'].includes(result.status)
            || (result.status !== 'not_found' && result.vatNo !== target.number)) {
          throw new Error('Neizdevās pārbaudīt PVN statusu. Mēģiniet vēlreiz vai pārbaudiet VID servisā.');
        }
        Object.assign(slot, result);
        if (result.status === 'active' && !compactId(party.vatNo)) {
          party.vatNo = result.vatNo;
          slot.key = signature(party);
          slot.autofilled = true;
          onAutofill(role);
        }
      } catch (err) {
        if (!current() || slot.abort.signal.aborted) return;
        slot.status = 'error';
        slot.message = err.message;
      }
      if (current()) onChange();
    };
    if (immediate) void run();
    else slot.timer = setTimeout(run, delay);
  }
  return {
    schedule,
    get(role) { return slots.get(role); },
    reset() { for (const role of slots.keys()) cancel(role); slots.clear(); },
  };
}

export function vatCheckWarning(party, check) {
  if (!check || check.party !== party || check.key !== signature(party)) return null;
  const vatNo = compactId(party.vatNo);
  if (['inactive', 'not_found'].includes(check.status) && vatNo) {
    return 'Norādītais PVN numurs VID atvērtajos datos nav reģistrēts kā aktīvs. Pārbaudiet partnera datus un rēķina datumu.';
  }
  if (check.status === 'active' && party.country === 'LV' && /^\d{11}$/.test(compactId(party.regNo))
      && vatNo.slice(2) !== compactId(party.regNo)) {
    return 'PVN numurs atšķiras no norādītā Latvijas reģistrācijas numura. Pārbaudiet, vai abi numuri pieder šai rēķina pusei.';
  }
  return null;
}
