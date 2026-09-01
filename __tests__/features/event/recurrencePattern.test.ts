import i18n from '../../../src/utils/i18n';
import { formatRecurrenceRule, defaultYearlyMonthPositionRule, defaultYearlyWeekNumberRule } from '@/features/event/utils/recurrencePattern';
import type { RecurrenceRule } from '@/types';

const DTSTART = new Date(2026, 7, 26, 14, 0, 0);

beforeEach(async () => {
  await i18n.changeLanguage('en');
});

describe('formatRecurrenceRule', () => {
  it('formats a daily rule', () => {
    const rule: RecurrenceRule = { freq: 'DAILY' };
    expect(formatRecurrenceRule(rule, DTSTART, i18n.t, i18n.language)).toBe('Daily');
  });

  it('formats a weekly rule with days', () => {
    const rule: RecurrenceRule = { freq: 'WEEKLY', byDay: ['MO', 'WE'] };
    const label = formatRecurrenceRule(rule, DTSTART, i18n.t, i18n.language);
    expect(label).toMatch(/^Weekly/);
    expect(label).toMatch(/Monday/);
    expect(label).toMatch(/Wednesday/);
  });

  it('formats a monthly weekday-position rule', () => {
    const rule: RecurrenceRule = { freq: 'MONTHLY', byDay: ['4MO'] };
    const label = formatRecurrenceRule(rule, DTSTART, i18n.t, i18n.language);
    expect(label).toMatch(/^Monthly/);
    expect(label).toMatch(/Fourth/);
    expect(label).toMatch(/Monday/);
  });

  it('formats a monthly same-date rule', () => {
    const rule: RecurrenceRule = { freq: 'MONTHLY' };
    const label = formatRecurrenceRule(rule, DTSTART, i18n.t, i18n.language);
    expect(label).toMatch(/^Monthly/);
    expect(label).toMatch(/26/);
  });

  it('formats a yearly month-position rule', () => {
    const rule: RecurrenceRule = {
      freq: 'YEARLY',
      byMonth: [8],
      byDay: ['4MO'],
    };
    const label = formatRecurrenceRule(rule, DTSTART, i18n.t, i18n.language);
    expect(label).toMatch(/^Yearly/);
    expect(label).toMatch(/Fourth/);
    expect(label).toMatch(/Monday/);
    expect(label).toMatch(/August/);
  });

  it('formats a yearly week-number rule', () => {
    const rule: RecurrenceRule = {
      freq: 'YEARLY',
      byWeekNo: [35],
      byDay: ['MO'],
    };
    const label = formatRecurrenceRule(rule, DTSTART, i18n.t, i18n.language);
    expect(label).toMatch(/^Yearly/);
    expect(label).toMatch(/week 35/i);
    expect(label).toMatch(/Monday/);
  });

  it('formats a yearly same-date rule', () => {
    const rule: RecurrenceRule = { freq: 'YEARLY' };
    const label = formatRecurrenceRule(rule, DTSTART, i18n.t, i18n.language);
    expect(label).toMatch(/^Yearly/);
    expect(label).toMatch(/26/);
    expect(label).toMatch(/August/);
  });

  it('includes interval when greater than one', () => {
    const rule: RecurrenceRule = { freq: 'DAILY', interval: 3 };
    expect(formatRecurrenceRule(rule, DTSTART, i18n.t, i18n.language)).toMatch(/\(×3\)/);
  });

  it('uses locale for month names', async () => {
    await i18n.changeLanguage('fr');
    const rule: RecurrenceRule = { freq: 'YEARLY' };
    const label = formatRecurrenceRule(rule, DTSTART, i18n.t, i18n.language);
    expect(label).toMatch(/août/i);
  });
});
