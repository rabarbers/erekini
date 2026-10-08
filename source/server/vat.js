import { vatLookupTarget, VID_DATASET_URL } from '../public/js/vat-check.js';

const RESOURCE_ID = '610910e9-e086-4c5b-a7ea-0a896a697672';
const API_URL = 'https://data.gov.lv/dati/api/3/action/datastore_search';

export class VatLookupError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function lookupVatStatus(party, { fetchImpl = fetch, timeoutMs = 10000, now = () => new Date() } = {}) {
  const target = vatLookupTarget(party);
  if (target.status === 'unsupported') return { status: 'unsupported' };
  if (!target.number) throw new VatLookupError(400, 'Norādiet Latvijas PVN numuru (LV un 11 cipari) vai 11 ciparu reģistrācijas numuru.');
  const url = new URL(API_URL);
  url.search = new URLSearchParams({ resource_id: RESOURCE_ID, filters: JSON.stringify({ Numurs: target.number }), limit: '100' });
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    const response = await fetchImpl(url, { signal, headers: { Accept: 'application/json' }, redirect: 'error' });
    if (!response.ok) throw new Error('VID HTTP kļūda');
    const payload = await response.json();
    const result = payload?.result;
    if (payload?.success !== true || !Array.isArray(result?.records)
        || !Number.isInteger(result.total) || result.total !== result.records.length || result.total_was_estimated === true) {
      throw new Error('Nepilnīga VID atbilde');
    }
    const records = result.records;
    if (records.some((r) => r.Numurs !== target.number || !['ir', 'nav'].includes(r.Aktivs?.trim()))) {
      throw new Error('Nezināms VID ieraksts');
    }
    // Vienam numuram var būt vairāki vēsturiski ieraksti; aktīvs ieraksts ir prioritārs.
    const active = records.find((r) => r.Aktivs.trim() === 'ir');
    return {
      status: active ? 'active' : records.length ? 'inactive' : 'not_found',
      vatNo: (active ?? records[0])?.Numurs ?? null,
      checkedAt: now().toISOString(),
      sourceUrl: VID_DATASET_URL,
    };
  } catch {
    throw new VatLookupError(signal.aborted ? 504 : 502,
      'Neizdevās pārbaudīt PVN statusu VID atvērtajos datos. Mēģiniet vēlreiz vai pārbaudiet VID servisā.');
  }
}
