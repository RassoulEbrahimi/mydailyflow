# My Daily Flow — Claude Code Reference

## Project
Mobile-first daily task manager. Deployed to GitHub Pages at `/mydailyflow/`.

## Stack
- **Frontend:** React 19, TypeScript ~5.8, Vite 6, Tailwind CSS 4
- **Icons:** Lucide React
- **Animations:** Motion
- **Drag-and-drop:** dnd-kit (@dnd-kit/core, @dnd-kit/sortable)
- **Backend (voice only):** Express + Multer, Mistral/Voxtral for audio transcription
- **PWA:** Service worker registered in main.tsx
- **Optional identity + sync (P2-8/P2-9, both default off):** Supabase Auth, local-first outbox, RLS-owned records and explicit conflicts

## Commands
```
npm run dev      # Vite dev server on port 3000
npm run build    # TypeScript check + Vite production build → dist/
npm run deploy   # build + gh-pages deploy
npm run lint     # tsc --noEmit (type check only, no emit)
npm start        # Express backend on port 3001 (voice API only)
```

Run `npm run lint` and `npm run build` to verify correctness after any code change.

## Architecture
All task and essentials data remains **local-first in browser localStorage**.
P2-8 adds optional Supabase identity and P2-9 adds account-owned remote records,
an offline outbox and explicit conflict resolution. They are separately gated by
`VITE_REAL_AUTH_ENABLED=false` and `VITE_SYNC_ENABLED=false`; without both exact
opt-ins, no sync transport is constructed and no app payload leaves the device.

### localStorage keys
`src/utils/appStorage.ts` is the single source of truth for every key the app owns.

| Key | Owner | Contents | In backup |
|-----|-------|----------|-----------|
| `myDailyFlowTasks` | `useTasks.ts` | `{version, data: Task[]}` | yes |
| `myDailyFlowEssentialsData` | `useDailyEssentials.ts` | `{version, data: DailyEssential[]}` | yes |
| `myDailyFlowEssentialsState` | `useDailyEssentials.ts` | `{version, data: {date, progressById}}` | yes |
| `myDailyFlow_theme` | `useTheme.ts` | `light \| dark \| system` | yes |
| `remindersEnabled` / `stickyHeroEnabled` | `App.tsx` | `"true" \| "false"` | yes |
| `myDailyFlow_essentialsCollapsed` | `DailyEssentialsSection.tsx` | `"true" \| "false"` | yes |
| `lastRolloverDate` | `useTasks.ts` | `YYYY-MM-DD`, write-only derived state | no |
| `mdf_auth_session` | `fakeAuth.ts` | demo session | **never** |
| `mdf_supabase_auth` | Supabase SDK | optional real-auth session | **never** |
| `mdf_sync_device_v1` | P2-9 sync | random installation/device UUID | no |
| `mdf_sync_state_v1_<user-id>` | P2-9 sync | per-account shadow, outbox and revision metadata | no |
| `myDailyFlow_recovery__*` | `appStorage.ts` | quarantined raw values | never auto-restored |

**Storage safety rules:** a value that fails parsing or validation is copied to a timestamped recovery key and only then removed; if the copy fails, the original stays put. Writes for that slice are suspended (independently per slice) until the user resolves it in Settings or an import succeeds. Multi-key writes go through `applyStorageTransaction`, which verifies each write by read-back and restores every affected key on failure. The Express backend (`server.js`, port 3001) exists solely to proxy audio blobs to Mistral/Voxtral for voice transcription (`POST /api/transcribe`). Vite proxies `/api` → `http://localhost:3001` during dev.

## Key Files

### Hooks (src/hooks/)
| File | Role |
|------|------|
| `useTasks.ts` | Task CRUD, localStorage persistence, daily rollover, recurrence logic |
| `useDailyEssentials.ts` | Daily essentials state (per-day, resets at midnight) |
| `useReminders.ts` | Schedules browser notifications 10 min before tasks |
| `useAuth.ts` | Demo localStorage auth |
| `useRealAuth.ts` | Optional Supabase session and password-recovery state |
| `useSyncCoordinator.ts` | Flagged local-first sync, outbox replay, remote refresh and explicit conflict resolution |

### Components (src/components/)
| File | Role |
|------|------|
| `App.tsx` | Root: auth gate, tab routing (Today/All/Done/Reminders), FAB |
| `HomeHero.tsx` | Progress circle + stats on Today tab — **keep stable** |
| `TaskCard.tsx` | Task card with swipe actions |
| `NewTaskModal.tsx` | Create/edit task form |
| `SettingsModal.tsx` | Reminders toggle, sticky hero, theme, backup/restore, logout |
| `BackupRestoreSection.tsx` | Export/import JSON backup, recovery snapshot list |
| `DailyEssentialsSection.tsx` | Essentials display + progress |
| `ManageEssentialsModal.tsx` | Add/edit essentials |
| `VoiceTaskModal.tsx` | Audio recording → transcription → task |
| `AllTasksFilterBar.tsx` | Date-range filter for All tab |
| `LoginPage.tsx` | Demo login screen |
| `RealAuthRoot.tsx` | Flagged real-auth gate and first-sign-in reconciliation |

### Types & Utils
| File | Role |
|------|------|
| `src/types/task.ts` | `Task`, `ChecklistItem` interfaces + validators |
| `src/types/essential.ts` | `DailyEssential` interface + validators |
| `src/utils/taskUtils.ts` | Date helpers, filtering, grouping, recurrence date calc |
| `src/services/voiceApi.ts` | HTTP call to Express `/api/transcribe` |
| `src/types/backup.ts` | `BackupFileV1` format + full-file validation |
| `src/utils/appStorage.ts` | Storage keys, quarantine, atomic multi-key writes, slice loaders |
| `src/utils/backupFormat.ts` | Build / serialize / parse backup files (pure) |
| `src/utils/backupMerge.ts` | Merge & replace semantics, dedup, progress reset (pure) |
| `src/utils/backupService.ts` | Export/import orchestration against localStorage |
| `src/utils/storageHealth.ts` | Registry of slices whose writes are suspended |

### Task Shape (abbreviated)
```typescript
interface Task {
  id: string;
  title: string;
  time: string;           // "HH:MM" 24h
  duration: string;       // "15m", "1h", etc.
  timeBlock: 'morning' | 'afternoon' | 'evening';
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  date: string;           // "YYYY-MM-DD" local timezone
  recurrence?: 'none' | 'daily' | 'every2days' | 'weekly' | 'monthly';
  recurrenceSourceId?: string;
  reminderEnabled?: boolean;
  checklistItems?: ChecklistItem[];
  rolledOverFrom?: string;
}
```

## Shipped Features
- Tasks with time blocks (morning / afternoon / evening)
- Today / All / Done tabs
- Daily rollover (incomplete tasks carry forward)
- Recurrence (spawns next occurrence on completion)
- Daily Essentials (per-day checklist with target counts)
- Reminders v2 (browser notifications 10 min before task time)
- NewTaskModal and SettingsModal (extracted components)
- Voice note / voice task (Mistral/Voxtral transcription)
- PWA with service worker + update banner
- Drag-and-drop task reordering (dnd-kit)
- Search and date-range filtering (All tab)
- Backup & Restore (versioned JSON export/import, merge or replace, corruption-safe storage)

## Working Rules
1. **Do not redesign stable areas** (especially Today tab / HomeHero) unless explicitly requested.
2. **No feature creep** — implement only what is asked.
3. **Prefer small, production-safe changes.** When a change is larger in scope, explain the plan first and wait for approval.
4. **Preserve existing architecture and style** — React hooks + localStorage, Tailwind utility classes, Lucide icons.
5. **Do not touch unrelated files.**
6. **No large refactors without explicit approval.**
7. **Run `npm run lint` and `npm run build`** to verify type correctness when changing TypeScript files.
8. **Deployment:** `npm run deploy` targets GitHub Pages; the Vite base is `/mydailyflow/`.
