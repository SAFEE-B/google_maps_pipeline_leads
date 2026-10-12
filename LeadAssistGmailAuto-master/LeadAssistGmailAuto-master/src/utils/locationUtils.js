'use strict';

// Location helpers shared by the sheet reader, scraper, lead saver and file generator.
//
// US lists use 5-digit zip codes. Canadian lists use FSAs: the first three characters of a
// postal code ("H2A" of "H2A 1B2"). Countries are the plain strings 'USA' / 'Canada' so the
// value doubles as the suffix appended to Google Maps queries.

const COUNTRY = { USA: 'USA', CANADA: 'Canada' };

// D, F, I, O, Q and U are never used in postal codes, and W and Z never start one.
const FSA = '[ABCEGHJ-NPRSTVXY]\\d[ABCEGHJ-NPRSTV-Z]';
const LDU = '\\d[ABCEGHJ-NPRSTV-Z]\\d';

const PROVINCE_CODES = ['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'];
const PROVINCE_NAMES = [
  'alberta', 'british columbia', 'manitoba', 'new brunswick', 'newfoundland and labrador',
  'newfoundland', 'nova scotia', 'northwest territories', 'nunavut', 'ontario',
  'prince edward island', 'quebec', 'québec', 'saskatchewan', 'yukon'
];
const PROV = PROVINCE_CODES.join('|');

const US_ZIP_RE = /^\d{5}(-\d{4})?$/;
const FSA_RE = new RegExp(`^${FSA}$`, 'i');
const POSTAL_RE = new RegExp(`^${FSA}[ -]?${LDU}$`, 'i');

// ", QC H2A 1B2" or ", QC H2A" (Google sometimes shows only the FSA for area results)
const PROVINCE_POSTAL_RE = new RegExp(`,\\s*(?:${PROV})\\s+(${FSA})(?:[ -]?(${LDU}))?(?![A-Z0-9])`, 'i');
const ANY_POSTAL_RE = new RegExp(`(?<![A-Z0-9])(${FSA})[ -]?(${LDU})(?![A-Z0-9])`, 'gi');
const CITY_PROVINCE_POSTAL_RE = new RegExp(
  `(?:^|,)\\s*([^,]+?)\\s*,\\s*(${PROV})\\s+(${FSA})(?:[ -]?(${LDU}))?(?![A-Z0-9])`, 'i'
);

function isUsZip(value) {
  return US_ZIP_RE.test(String(value || '').trim());
}

// True for a full postal code ("H2A 1B2") or an FSA ("H2A").
function isCanadianPostal(value) {
  const s = String(value || '').trim();
  return FSA_RE.test(s) || POSTAL_RE.test(s);
}

// "h2a1b2" -> "H2A 1B2", "h2a" -> "H2A"
function normalizeCanadianPostal(value) {
  const s = String(value || '').replace(/[\s-]/g, '').toUpperCase();
  return s.length > 3 ? `${s.slice(0, 3)} ${s.slice(3)}` : s;
}

// Pulls the postal code (or FSA) out of an address; null if there isn't one.
function extractCanadianPostal(address) {
  if (!address || typeof address !== 'string') return null;

  const withProvince = address.match(PROVINCE_POSTAL_RE);
  if (withProvince) return normalizeCanadianPostal(withProvince[1] + (withProvince[2] || ''));

  // No province marker: accept a full postal code, taking the last one (street text comes first).
  let last = null;
  for (const m of address.matchAll(ANY_POSTAL_RE)) last = m;
  return last ? normalizeCanadianPostal(last[1] + last[2]) : null;
}

// True if an address looks Canadian ("..., Surrey, BC V3V 3G7, Canada").
function isCanadianAddress(address) {
  if (!address || typeof address !== 'string') return false;
  return /\bcanada\s*$/i.test(address.trim()) || PROVINCE_POSTAL_RE.test(address);
}

// Splits a Canadian address into city / province / postal code. Null if it isn't Canadian.
function parseCanadianAddress(address) {
  if (!isCanadianAddress(address)) return null;

  const m = address.match(CITY_PROVINCE_POSTAL_RE);
  if (m) {
    return {
      city: m[1].trim(),
      state: m[2].toUpperCase(),
      zipCode: normalizeCanadianPostal(m[3] + (m[4] || ''))
    };
  }
  return { city: null, state: null, zipCode: extractCanadianPostal(address) };
}

// Reads the sheet's "State" column. Returns 'Canada', 'USA', or null when it can't tell.
// "CA" is deliberately not treated as Canada: in a State column it means California.
function parseCountry(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return null;
  if (/\bcanad(a|ian)\b/.test(t)) return COUNTRY.CANADA;
  if (/^(usa|us|u\.s\.a?\.?|united states( of america)?)$/.test(t)) return COUNTRY.USA;

  const tokens = t.split(/[,;/|]+/).map(s => s.trim()).filter(Boolean);
  const isProvince = tok => PROVINCE_NAMES.includes(tok) || PROVINCE_CODES.includes(tok.toUpperCase());
  if (tokens.length > 0 && tokens.every(isProvince)) return COUNTRY.CANADA;
  return null;
}

// Country for one location. The shape of the location wins (an FSA is always Canadian, a
// 5-digit zip always American); city names fall back to the list-level hint, then USA.
function resolveCountry(location, hint) {
  if (isCanadianPostal(location)) return COUNTRY.CANADA;
  if (isUsZip(location)) return COUNTRY.USA;
  return hint === COUNTRY.CANADA ? COUNTRY.CANADA : COUNTRY.USA;
}

// Canadian postal codes are searched upper-cased; everything else is left as typed.
function formatLocationForSearch(location) {
  const s = String(location || '').trim();
  return isCanadianPostal(s) ? normalizeCanadianPostal(s) : s;
}

// Appends the country to a Google Maps query so the search is anchored to the right country.
// Leaves the query alone if it already ends in one.
function buildScraperQuery(query, country) {
  const base = String(query || '').trim();
  if (/\b(usa|us|united states|canada)$/i.test(base)) return base;
  return `${base} ${country === COUNTRY.CANADA ? COUNTRY.CANADA : COUNTRY.USA}`;
}

module.exports = {
  COUNTRY,
  isUsZip,
  isCanadianPostal,
  normalizeCanadianPostal,
  extractCanadianPostal,
  isCanadianAddress,
  parseCanadianAddress,
  parseCountry,
  resolveCountry,
  formatLocationForSearch,
  buildScraperQuery
};
