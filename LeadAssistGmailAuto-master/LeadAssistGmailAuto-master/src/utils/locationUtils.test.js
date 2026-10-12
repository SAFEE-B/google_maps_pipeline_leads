const {
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
} = require('./locationUtils');

describe('isCanadianPostal', () => {
  test.each(['H2A', 'h2a', 'J4G', 'M5V', 'H2A 1B2', 'h2a1b2', 'H2A-1B2'])('accepts %s', (value) => {
    expect(isCanadianPostal(value)).toBe(true);
  });

  test.each(['90210', '10001-1234', 'Toronto', 'D2A', 'H2A 1B', 'H2A 1B22', 'W1A', '', null])(
    'rejects %s', (value) => {
      expect(isCanadianPostal(value)).toBe(false);
    }
  );
});

describe('isUsZip', () => {
  test('accepts 5-digit and ZIP+4, rejects postal codes', () => {
    expect(isUsZip('90210')).toBe(true);
    expect(isUsZip('10001-1234')).toBe(true);
    expect(isUsZip('H2A')).toBe(false);
    expect(isUsZip('9021')).toBe(false);
  });
});

describe('normalizeCanadianPostal', () => {
  test('upper-cases and spaces full codes, leaves FSAs as three characters', () => {
    expect(normalizeCanadianPostal('h2a1b2')).toBe('H2A 1B2');
    expect(normalizeCanadianPostal('h2a-1b2')).toBe('H2A 1B2');
    expect(normalizeCanadianPostal('h2a')).toBe('H2A');
  });
});

describe('parseCanadianAddress', () => {
  test('does not mistake a 5-digit street number for a zip', () => {
    expect(parseCanadianAddress('12160 103A Ave #826, Surrey, BC V3V 3G7, Canada')).toEqual({
      city: 'Surrey', state: 'BC', zipCode: 'V3V 3G7'
    });
  });

  test('handles accented Quebec city names', () => {
    expect(parseCanadianAddress('1234 Rue Sainte-Catherine E, Montréal, QC H2A 1B2, Canada')).toEqual({
      city: 'Montréal', state: 'QC', zipCode: 'H2A 1B2'
    });
  });

  test('handles an FSA-only area result', () => {
    expect(parseCanadianAddress('Vancouver, BC V6B, Canada')).toEqual({
      city: 'Vancouver', state: 'BC', zipCode: 'V6B'
    });
  });

  test('returns null for US addresses', () => {
    expect(parseCanadianAddress('123 Main St, Phoenix, AZ 85001, United States')).toBeNull();
    expect(parseCanadianAddress('')).toBeNull();
    expect(parseCanadianAddress(null)).toBeNull();
  });
});

describe('extractCanadianPostal / isCanadianAddress', () => {
  test('finds the postal code in an address', () => {
    expect(extractCanadianPostal('724 Caledonia Rd, North York, ON M6B 3X7, Canada')).toBe('M6B 3X7');
  });

  test('returns null when there is none', () => {
    expect(extractCanadianPostal('123 Main St, Phoenix, AZ 85001, United States')).toBeNull();
    expect(extractCanadianPostal(undefined)).toBeNull();
  });

  test('recognises Canadian addresses', () => {
    expect(isCanadianAddress('724 Caledonia Rd, North York, ON M6B 3X7, Canada')).toBe(true);
    expect(isCanadianAddress('123 Main St, Phoenix, AZ 85001, United States')).toBe(false);
  });
});

describe('parseCountry', () => {
  test('reads Canada from the State column', () => {
    expect(parseCountry('Canada')).toBe(COUNTRY.CANADA);
    expect(parseCountry(' canada ')).toBe(COUNTRY.CANADA);
    expect(parseCountry('Quebec')).toBe(COUNTRY.CANADA);
    expect(parseCountry('ON, QC')).toBe(COUNTRY.CANADA);
  });

  test('"CA" means California, not Canada', () => {
    expect(parseCountry('CA')).toBeNull();
    expect(parseCountry('California')).toBeNull();
  });

  test('reads USA and returns null when unknown', () => {
    expect(parseCountry('USA')).toBe(COUNTRY.USA);
    expect(parseCountry('United States')).toBe(COUNTRY.USA);
    expect(parseCountry('Washington')).toBeNull();
    expect(parseCountry('')).toBeNull();
  });
});

describe('resolveCountry', () => {
  test('the shape of the location wins over the hint', () => {
    expect(resolveCountry('H2A', COUNTRY.USA)).toBe(COUNTRY.CANADA);
    expect(resolveCountry('90210', COUNTRY.CANADA)).toBe(COUNTRY.USA);
  });

  test('city names use the hint and default to USA', () => {
    expect(resolveCountry('Toronto', COUNTRY.CANADA)).toBe(COUNTRY.CANADA);
    expect(resolveCountry('Toronto')).toBe(COUNTRY.USA);
  });
});

describe('formatLocationForSearch', () => {
  test('upper-cases postal codes only', () => {
    expect(formatLocationForSearch('h2a')).toBe('H2A');
    expect(formatLocationForSearch('h2a1b2')).toBe('H2A 1B2');
    expect(formatLocationForSearch('Phoenix')).toBe('Phoenix');
    expect(formatLocationForSearch('90210')).toBe('90210');
  });
});

describe('buildScraperQuery', () => {
  test('anchors the query to the right country', () => {
    expect(buildScraperQuery('nursing homes in H2A', COUNTRY.CANADA)).toBe('nursing homes in H2A Canada');
    expect(buildScraperQuery('nursing homes in 90210', COUNTRY.USA)).toBe('nursing homes in 90210 USA');
  });

  test('does not add a country twice', () => {
    expect(buildScraperQuery('gyms in H2A Canada', COUNTRY.CANADA)).toBe('gyms in H2A Canada');
    expect(buildScraperQuery('rv park near 90210 US', COUNTRY.USA)).toBe('rv park near 90210 US');
  });

  test('a city ending in "us" is not mistaken for "US"', () => {
    expect(buildScraperQuery('gyms in Columbus', COUNTRY.USA)).toBe('gyms in Columbus USA');
  });
});
