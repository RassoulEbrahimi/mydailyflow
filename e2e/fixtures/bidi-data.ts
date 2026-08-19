/**
 * bidi-data.ts — synthetic DE / EN / FA / mixed content for the PR5 suite.
 *
 * Same rules as synthetic-data.ts: every value is invented for testing, nothing
 * here is a real credential, a real account or a real user's data, and the
 * shapes mirror src/types/** without importing from src/** so a schema drift
 * shows up as a test failure rather than being silently followed.
 *
 * The Persian strings are ordinary everyday phrases chosen to exercise a
 * specific bidi property each, named in the comment above them. They are stored
 * exactly as written — no Unicode directional control characters (U+200E,
 * U+200F, U+2066..U+2069, U+202A..U+202E) appear anywhere in this file, because
 * the app must not need them and must never write them. `assertNoBidiControls`
 * below is the guard that keeps that true.
 */

import { TODAY, YESTERDAY, type SeedEssential, type SeedTask } from './synthetic-data';

const iso = (day: string, time: string) => `${day}T${time}:00.000+02:00`;

/** Unicode directional formatting and isolate characters, as a class. */
export const BIDI_CONTROL_RE = /[‎‏؜‪-‮⁦-⁩]/u;

/**
 * The app is required to get direction right from markup alone. If a control
 * character ever appears in a stored string, either the fixture or the app
 * started smuggling direction into the data — both are failures.
 */
export function assertNoBidiControls(value: string): boolean {
  return !BIDI_CONTROL_RE.test(value);
}

/**
 * Scenario keys, so a failing assertion names the content case rather than an
 * opaque index. `expectedDir` is what `dir="auto"` must resolve the element to:
 * the HTML algorithm takes the *first strong* character, so neutrals — emoji,
 * ASCII digits, punctuation — never decide, and a string with no strong
 * character at all falls back to the ancestor direction (ltr here).
 */
export type BidiDir = 'ltr' | 'rtl';

export interface BidiCase {
  id: string;
  title: string;
  expectedDir: BidiDir;
  note: string;
}

export const BIDI_TITLE_CASES: BidiCase[] = [
  {
    id: 'bidi-de',
    title: 'Zahnarzttermin vorbereiten',
    expectedDir: 'ltr',
    note: 'pure German',
  },
  {
    id: 'bidi-en',
    title: 'Review the weekly report',
    expectedDir: 'ltr',
    note: 'pure English',
  },
  {
    id: 'bidi-fa',
    title: 'خرید مواد غذایی برای هفته',
    expectedDir: 'rtl',
    note: 'pure Persian',
  },
  {
    id: 'bidi-fa-emoji',
    title: '🎯 تمرین ورزشی روزانه',
    expectedDir: 'rtl',
    note: 'Persian behind a leading emoji — the emoji is neutral, so it must not decide',
  },
  {
    id: 'bidi-fa-digits',
    title: '3 جلسه با تیم پروژه',
    expectedDir: 'rtl',
    note: 'Persian behind leading ASCII digits — digits are weak, not strong',
  },
  {
    id: 'bidi-en-fa',
    title: 'Buy milk از سوپرمارکت',
    expectedDir: 'ltr',
    note: 'English sentence containing a Persian phrase — first strong char is Latin',
  },
  {
    id: 'bidi-fa-en',
    title: 'نصب Visual Studio Code روی لپ‌تاپ',
    expectedDir: 'rtl',
    note: 'Persian sentence containing an English product name',
  },
  {
    id: 'bidi-fa-de',
    title: 'قرار ملاقات با Hausarzt در Charité',
    expectedDir: 'rtl',
    note: 'Persian sentence containing German terms',
  },
  {
    id: 'bidi-punct',
    title: 'گزارش (Q3) / بررسی: 2026-05-20 — نسخه 2',
    expectedDir: 'rtl',
    note: 'parentheses, slash, colon, dash and numbers inside Persian',
  },
  {
    id: 'bidi-long',
    title:
      'برنامه‌ریزی هفتگی برای پروژه My Daily Flow شامل بررسی Backup & Restore و تنظیمات Reminders و همچنین بازبینی کامل رابط کاربری در حالت تاریک و روشن',
    expectedDir: 'rtl',
    note: 'very long mixed title — the 360px wrapping and truncation case',
  },
  {
    id: 'bidi-punct-only',
    title: '... — /// (!)',
    expectedDir: 'ltr',
    note: 'punctuation only: no strong character, so it inherits the LTR chrome',
  },
  {
    id: 'bidi-empty',
    title: '',
    expectedDir: 'ltr',
    note: 'empty title: defensive, must render an empty box and inherit LTR',
  },
];

/** Fast lookup by scenario id. */
export const BIDI_CASE_BY_ID = new Map(BIDI_TITLE_CASES.map((c) => [c.id, c]));

/** Persian notes, deliberately multi-line. */
export const FA_NOTES = 'یادداشت اول برای این کار.\nخط دوم با توضیح بیشتر.\nخط سوم و پایانی.';

/** Persian checklist items, one of them already ticked. */
export const FA_CHECKLIST = [
  { id: 'bidi-ci-1', text: 'آماده‌سازی مدارک و فرم‌ها', completed: false },
  { id: 'bidi-ci-2', text: 'تماس با پشتیبانی Vodafone', completed: true },
  { id: 'bidi-ci-3', text: 'ارسال ایمیل نهایی', completed: false },
];

/**
 * The full task seed for the bidi suite.
 *
 * Every title case above becomes a timed, incomplete task dated TODAY, so all of
 * them render on Today, on All and (as rows) on Reminders. Four extra tasks
 * carry the states that have to be measured *beside* RTL text: notes and a
 * checklist, an overdue + rolled-over + recurring card, an untimed card
 * ("Ohne Zeit"), and a completed card for the Done tab.
 *
 * Times are spread across the three blocks but every incomplete task is dated
 * TODAY, so the daily rollover never touches this seed.
 */
export const BIDI_TASKS: SeedTask[] = [
  ...BIDI_TITLE_CASES.map((c, i): SeedTask => ({
    id: c.id,
    title: c.title,
    // 15:00 onward — after the pinned 14:30, so none of these read as overdue.
    time: `${String(15 + Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`,
    duration: '30m',
    timeBlock: 'afternoon',
    completed: false,
    priority: (['low', 'medium', 'high'] as const)[i % 3],
    createdAt: iso(TODAY, '06:00'),
    date: TODAY,
  })),
  {
    // Persian notes + Persian checklist, on one card.
    id: 'bidi-fa-rich',
    title: 'بازبینی اسناد پروژه',
    time: '17:30',
    duration: '45m',
    timeBlock: 'afternoon',
    completed: false,
    priority: 'medium',
    createdAt: iso(TODAY, '06:01'),
    date: TODAY,
    notes: FA_NOTES,
    checklistItems: FA_CHECKLIST,
  },
  {
    // German badges — Überfällig, the rollover chip and the recurrence chip —
    // all rendered immediately beside an RTL title.
    id: 'bidi-fa-badges',
    title: 'پرداخت قبض برق و گاز',
    time: '08:15',
    duration: '15m',
    timeBlock: 'morning',
    completed: false,
    priority: 'high',
    createdAt: iso(TODAY, '06:02'),
    date: TODAY,
    recurrence: 'daily',
    rolledOverFrom: YESTERDAY,
  },
  {
    // Untimed: the meta row reads "Ohne Zeit • 20m" beside RTL content.
    id: 'bidi-fa-untimed',
    title: 'مطالعه کتاب قبل از خواب',
    time: '',
    duration: '20m',
    timeBlock: 'evening',
    completed: false,
    priority: 'low',
    createdAt: iso(TODAY, '06:03'),
    date: TODAY,
  },
  {
    // Completed, dated yesterday so rollover leaves it alone and the Done tab
    // has RTL content with a strike-through.
    id: 'bidi-fa-done',
    title: 'ارسال گزارش ماهانه به مدیر',
    time: '19:00',
    duration: '10m',
    timeBlock: 'evening',
    completed: true,
    priority: 'high',
    createdAt: iso(YESTERDAY, '19:00'),
    date: YESTERDAY,
  },
];

/** Persian and mixed essentials: one simple row, one counter row, one mixed. */
export const BIDI_ESSENTIALS: SeedEssential[] = [
  {
    id: 'bidi-ess-simple',
    title: 'ویتامین روزانه',
    targetCount: 1,
    order: 0,
    createdAt: iso(YESTERDAY, '06:00'),
  },
  {
    id: 'bidi-ess-multi',
    title: 'نوشیدن آب کافی در طول روز',
    targetCount: 6,
    order: 1,
    createdAt: iso(YESTERDAY, '06:01'),
  },
  {
    id: 'bidi-ess-mixed',
    title: 'تمرین Deutsch (30 دقیقه)',
    targetCount: 3,
    order: 2,
    createdAt: iso(YESTERDAY, '06:02'),
  },
];

export const BIDI_ESSENTIALS_STATE = {
  date: TODAY,
  progressById: {
    'bidi-ess-simple': 1,
    'bidi-ess-multi': 2,
    'bidi-ess-mixed': 0,
  } as Record<string, number>,
};

/** Every user-authored string this fixture puts into storage. */
export const ALL_BIDI_STRINGS: string[] = [
  ...BIDI_TASKS.flatMap((t) => [
    t.title,
    t.notes ?? '',
    ...(t.checklistItems ?? []).map((c) => c.text),
  ]),
  ...BIDI_ESSENTIALS.map((e) => e.title),
];
