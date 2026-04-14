jest.mock('../../utils/logger', () => ({ scraperLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const { groupQueriesByBusinessType, convertToRelativeDate } = require('./dockerScraper');

describe('groupQueriesByBusinessType', () => {
  test('groups single business type correctly', () => {
    const queries = [
      { businessType: 'rv park', query: 'rv park near 90210 US' },
      { businessType: 'rv park', query: 'rv park near 10001 US' },
    ];
    const result = groupQueriesByBusinessType(queries);
    expect(result).toEqual({
      'rv park': ['rv park near 90210 US', 'rv park near 10001 US'],
    });
  });

  test('groups multiple business types correctly', () => {
    const queries = [
      { businessType: 'rv park', query: 'rv park near 90210 US' },
      { businessType: 'nursing home', query: 'nursing home near 90210 US' },
      { businessType: 'rv park', query: 'rv park near 10001 US' },
    ];
    const result = groupQueriesByBusinessType(queries);
    expect(result).toEqual({
      'rv park': ['rv park near 90210 US', 'rv park near 10001 US'],
      'nursing home': ['nursing home near 90210 US'],
    });
  });

  test('returns empty object for empty input', () => {
    expect(groupQueriesByBusinessType([])).toEqual({});
  });
});

describe('convertToRelativeDate', () => {
  test('returns relative string for a date 3 days ago', () => {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    const when = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    expect(convertToRelativeDate(when)).toBe('3 days ago');
  });

  test('returns relative string for a date 2 weeks ago', () => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    const when = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    expect(convertToRelativeDate(when)).toBe('2 weeks ago');
  });

  test('returns relative string for a date 3 months ago', () => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    const when = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    expect(convertToRelativeDate(when)).toBe('3 months ago');
  });

  test('returns relative string for a date 2 years ago', () => {
    const d = new Date();
    d.setDate(d.getDate() - 730);
    const when = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    expect(convertToRelativeDate(when)).toBe('2 years ago');
  });

  test('returns No review date for empty string', () => {
    expect(convertToRelativeDate('')).toBe('No review date');
  });

  test('returns No review date for null', () => {
    expect(convertToRelativeDate(null)).toBe('No review date');
  });

  test('returns No review date for invalid date string', () => {
    expect(convertToRelativeDate('not-a-date')).toBe('No review date');
  });
});

const { mapRowToPipelineFormat } = require('./dockerScraper');

describe('mapRowToPipelineFormat', () => {
  const baseRow = {
    title: 'Sunset RV Park',
    category: 'RV park',
    address: '123 Main St, Los Angeles, CA 90210, United States',
    website: 'sunsetrv.com',
    review_count: '42',
    review_rating: '4.5',
    phone: '+1 310-555-0100',
    user_reviews: JSON.stringify([{ Name: 'John', When: '2026-1-10', Rating: 5 }]),
  };

  test('maps all fields correctly', () => {
    const result = mapRowToPipelineFormat(baseRow, 'rv park');
    expect(result['Type of Business']).toBe('rv park');
    expect(result['Sub-Category']).toBe('RV park');
    expect(result['Name of Business']).toBe('Sunset RV Park');
    expect(result['Website']).toBe('sunsetrv.com');
    expect(result['# of Reviews']).toBe('42');
    expect(result['Rating']).toBe('4.5');
    expect(result['Business Address']).toBe('123 Main St, Los Angeles, CA 90210, United States');
    expect(result['Phone Number']).toBe('+1 310-555-0100');
    expect(result['Latest Review Date']).toMatch(/ago$/);
  });

  test('returns No review date when user_reviews is empty array', () => {
    const row = { ...baseRow, user_reviews: '[]' };
    const result = mapRowToPipelineFormat(row, 'rv park');
    expect(result['Latest Review Date']).toBe('No review date');
  });

  test('returns No review date when user_reviews is malformed JSON', () => {
    const row = { ...baseRow, user_reviews: 'not-json' };
    const result = mapRowToPipelineFormat(row, 'rv park');
    expect(result['Latest Review Date']).toBe('No review date');
  });

  test('returns No review date when user_reviews is missing', () => {
    const row = { ...baseRow, user_reviews: undefined };
    const result = mapRowToPipelineFormat(row, 'rv park');
    expect(result['Latest Review Date']).toBe('No review date');
  });

  test('uses empty string for missing optional fields', () => {
    const row = { title: 'Test', category: 'Test', address: 'Test', user_reviews: '[]' };
    const result = mapRowToPipelineFormat(row, 'gym');
    expect(result['Website']).toBe('');
    expect(result['Phone Number']).toBe('');
    expect(result['# of Reviews']).toBe('');
    expect(result['Rating']).toBe('');
  });
});
