/**
 * synthetic-data.ts — the only data the browser suite ever puts into a browser.
 *
 * Every value here is invented for testing. There are no real credentials, no
 * `VITE_FAKE_USER_*` / `VITE_FAKE_PASS_*` values, and nothing that could match a
 * real account: the session is injected directly, so the login form is never
 * filled in and no password is ever typed, transmitted, stored or logged.
 *
 * Shapes mirror src/types/task.ts and src/types/essential.ts exactly, and the
 * localStorage envelopes mirror src/utils/appStorage.ts (`{version, data}`),
 * but nothing is imported from src/** — the harness must be able to detect a
 * schema drift rather than silently follow it.
 */

/**
 * Wall-clock instant every test runs at, pinned via `page.clock.setFixedTime`.
 * Europe/Berlin, so the local date is 2026-05-20 and the local time is 14:30 —
 * inside the "Nachmittag" block, and past the seeded overdue task's 08:15.
 */
export const FIXED_NOW = new Date('2026-05-20T14:30:00+02:00');

/** Local (Europe/Berlin) calendar day of FIXED_NOW. */
export const TODAY = '2026-05-20';
/** The day before TODAY — used for already-completed history only. */
export const YESTERDAY = '2026-05-19';

/** Storage keys, restated here so a rename in src/** shows up as a test failure. */
export const KEYS = {
  tasks: 'myDailyFlowTasks',
  essentialsData: 'myDailyFlowEssentialsData',
  essentialsState: 'myDailyFlowEssentialsState',
  essentialHistory: 'myDailyFlowEssentialHistory',
  focusState: 'myDailyFlowFocusState',
  templates: 'myDailyFlowTemplates',
  theme: 'myDailyFlow_theme',
  remindersEnabled: 'remindersEnabled',
  stickyHeroEnabled: 'stickyHeroEnabled',
  essentialsCollapsed: 'myDailyFlow_essentialsCollapsed',
  /** Auth. Never written to localStorage by this suite — sessionStorage only. */
  authSession: 'mdf_auth_session',
  /** Derived, write-only app state. Never seeded. */
  lastRollover: 'lastRolloverDate',
  recoveryPrefix: 'myDailyFlow_recovery__',
} as const;

/**
 * Obviously synthetic identity. `expiresAt: null` is the sessionStorage shape
 * fakeAuth.saveSession() writes for a non-remembered login, so the app accepts
 * it without any expiry arithmetic.
 */
export const SYNTHETIC_SESSION = {
  username: 'e2e-synthetic-user',
  expiresAt: null,
} as const;

export interface SeedTask {
  id: string;
  title: string;
  time: string;
  duration: string;
  timeBlock: 'morning' | 'afternoon' | 'evening';
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
  date: string;
  notes?: string;
  recurrence?: 'none' | 'daily' | 'every2days' | 'weekly' | 'monthly';
  rolledOverFrom?: string;
  checklistItems?: { id: string; text: string; completed: boolean }[];
}

const iso = (day: string, time: string) => `${day}T${time}:00.000+02:00`;

/**
 * Synthetic tasks.
 *
 * Deliberate coverage:
 *  - one task per time block, so all three Today sections render;
 *  - `e2e-overdue` is incomplete, dated today, timed 08:15 < 14:30 → renders the
 *    overdue badge and the three-button swipe strip;
 *  - `e2e-checklist` carries a checklist, so the inline checklist controls exist;
 *  - completed tasks are dated yesterday so the daily rollover leaves them alone
 *    (rollover only moves *incomplete* past-dated tasks) and the Done and All
 *    tabs both have content.
 */
export const SEED_TASKS: SeedTask[] = [
  {
    id: 'e2e-overdue',
    title: 'Synthetische Aufgabe — überfällig',
    time: '08:15',
    duration: '15m',
    timeBlock: 'morning',
    completed: false,
    priority: 'high',
    createdAt: iso(TODAY, '06:00'),
    date: TODAY,
  },
  {
    id: 'e2e-morning',
    title: 'Synthetische Aufgabe — Morgen',
    time: '09:00',
    duration: '30m',
    timeBlock: 'morning',
    completed: false,
    priority: 'medium',
    createdAt: iso(TODAY, '06:01'),
    date: TODAY,
    recurrence: 'daily',
  },
  {
    id: 'e2e-checklist',
    title: 'Synthetische Aufgabe — mit Checkliste',
    time: '15:00',
    duration: '45m',
    timeBlock: 'afternoon',
    completed: false,
    priority: 'low',
    createdAt: iso(TODAY, '06:02'),
    date: TODAY,
    notes: 'Synthetische Notiz für den Messlauf.',
    checklistItems: [
      { id: 'e2e-ci-1', text: 'Erster synthetischer Punkt', completed: false },
      { id: 'e2e-ci-2', text: 'Zweiter synthetischer Punkt', completed: true },
    ],
  },
  {
    id: 'e2e-evening',
    title: 'Synthetische Aufgabe — Abend',
    time: '20:30',
    duration: '1h',
    timeBlock: 'evening',
    completed: false,
    priority: 'medium',
    createdAt: iso(TODAY, '06:03'),
    date: TODAY,
  },
  {
    id: 'e2e-done-1',
    title: 'Synthetische Aufgabe — erledigt',
    time: '07:00',
    duration: '10m',
    timeBlock: 'morning',
    completed: true,
    priority: 'low',
    createdAt: iso(YESTERDAY, '07:00'),
    date: YESTERDAY,
  },
  {
    id: 'e2e-done-2',
    title: 'Synthetische Aufgabe — gestern erledigt',
    time: '19:00',
    duration: '20m',
    timeBlock: 'evening',
    completed: true,
    priority: 'high',
    createdAt: iso(YESTERDAY, '19:00'),
    date: YESTERDAY,
  },
];

export interface SeedEssential {
  id: string;
  title: string;
  targetCount: number;
  order: number;
  createdAt: string;
}

/**
 * Synthetic essentials: one simple toggle (targetCount 1) and one multi-target
 * item (targetCount 6), so both the toggle row and the numbered 32px chip row
 * are measurable.
 */
export const SEED_ESSENTIALS: SeedEssential[] = [
  {
    id: 'e2e-ess-simple',
    title: 'Synthetisches Essential (einfach)',
    targetCount: 1,
    order: 0,
    createdAt: iso(YESTERDAY, '06:00'),
  },
  {
    id: 'e2e-ess-multi',
    title: 'Synthetisches Essential (mehrfach)',
    targetCount: 6,
    order: 1,
    createdAt: iso(YESTERDAY, '06:01'),
  },
];

/** Partial progress, so done and not-done chip states both render. */
export const SEED_ESSENTIALS_STATE = {
  date: TODAY,
  progressById: {
    'e2e-ess-simple': 1,
    'e2e-ess-multi': 2,
  } as Record<string, number>,
};

export type SeedTheme = 'dark' | 'light';

/** Optional content overrides. The envelope and the key set never change. */
export interface SeedOverrides {
  tasks?: SeedTask[];
  essentials?: SeedEssential[];
  essentialsState?: { date: string; progressById: Record<string, number> };
}

/** The exact localStorage payload the suite writes, as raw strings. */
export function buildStorageSeed(
  theme: SeedTheme,
  overrides: SeedOverrides = {},
): Record<string, string> {
  return {
    [KEYS.tasks]: JSON.stringify({ version: 1, data: overrides.tasks ?? SEED_TASKS }),
    [KEYS.essentialsData]: JSON.stringify({ version: 1, data: overrides.essentials ?? SEED_ESSENTIALS }),
    [KEYS.essentialsState]: JSON.stringify({ version: 1, data: overrides.essentialsState ?? SEED_ESSENTIALS_STATE }),
    [KEYS.focusState]: JSON.stringify({ version: 1, data: { activeSession: null, history: [] } }),
    [KEYS.templates]: JSON.stringify({ version: 1, data: [] }),
    [KEYS.theme]: theme,
    [KEYS.remindersEnabled]: 'false',
    [KEYS.stickyHeroEnabled]: 'true',
    [KEYS.essentialsCollapsed]: 'false',
  };
}
