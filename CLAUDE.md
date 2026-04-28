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
All task and essentials data is stored in **browser localStorage** — there is no database for the main app. The Express backend (`server.js`, port 3001) exists solely to proxy audio blobs to Mistral/Voxtral for voice transcription (`POST /api/transcribe`). Vite proxies `/api` → `http://localhost:3001` during dev.

## Key Files

### Hooks (src/hooks/)
| File | Role |
|------|------|
| `useTasks.ts` | Task CRUD, localStorage persistence, daily rollover, recurrence logic |
| `useDailyEssentials.ts` | Daily essentials state (per-day, resets at midnight) |
| `useReminders.ts` | Schedules browser notifications 10 min before tasks |
| `useAuth.ts` | Demo localStorage auth |

### Components (src/components/)
| File | Role |
|------|------|
| `App.tsx` | Root: auth gate, tab routing (Today/All/Done/Reminders), FAB |
| `HomeHero.tsx` | Progress circle + stats on Today tab — **keep stable** |
| `TaskCard.tsx` | Task card with swipe actions |
| `NewTaskModal.tsx` | Create/edit task form |
| `SettingsModal.tsx` | Reminders toggle, sticky hero, logout |
| `DailyEssentialsSection.tsx` | Essentials display + progress |
| `ManageEssentialsModal.tsx` | Add/edit essentials |
| `VoiceTaskModal.tsx` | Audio recording → transcription → task |
| `AllTasksFilterBar.tsx` | Date-range filter for All tab |
| `LoginPage.tsx` | Demo login screen |

### Types & Utils
| File | Role |
|------|------|
| `src/types/task.ts` | `Task`, `ChecklistItem` interfaces + validators |
| `src/types/essential.ts` | `DailyEssential` interface + validators |
| `src/utils/taskUtils.ts` | Date helpers, filtering, grouping, recurrence date calc |
| `src/services/voiceApi.ts` | HTTP call to Express `/api/transcribe` |

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

## Working Rules
1. **Do not redesign stable areas** (especially Today tab / HomeHero) unless explicitly requested.
2. **No feature creep** — implement only what is asked.
3. **Prefer small, production-safe changes.** When a change is larger in scope, explain the plan first and wait for approval.
4. **Preserve existing architecture and style** — React hooks + localStorage, Tailwind utility classes, Lucide icons.
5. **Do not touch unrelated files.**
6. **No large refactors without explicit approval.**
7. **Run `npm run lint` and `npm run build`** to verify type correctness when changing TypeScript files.
8. **Deployment:** `npm run deploy` targets GitHub Pages; the Vite base is `/mydailyflow/`.
