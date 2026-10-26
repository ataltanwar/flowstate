# flowstate

A minimalist, local-first task manager built with plain HTML, CSS, and JavaScript.

## Run it

Double-click `index.html`, or open it in any modern browser. No install, build step, or server is required.

## What it does

- **Today** — three day cards for Today, Tomorrow, and the day after, alongside every incomplete task grouped by its scheduled day.
- **Tasks** — All, Inbox (no date), and Completed views. Inbox tasks can be scheduled later.
- **Calendar** — month navigation, task indicators, selected-day list, and adding tasks to a date.
- Complete tasks directly from any list; completed tasks stay visible with a strikethrough.
- Drag open tasks on the Today homepage into Inbox, another open-task date group, or one of the three day cards to reschedule them.
- Use the Undo action in the confirmation toast to restore the task's previous date.
- Create, edit, delete, and reopen tasks. Priority defaults to Normal.
- Day view opens from a day card header and offers a focused list for that date.
- Everything is saved in `localStorage` under `flowstate.tasks.v1`.

## Files

- `index.html` — structure, navigation, and dialogs
- `style.css` — theme, layout, calendar, responsive rules
- `script.js` — state, rendering, task CRUD, calendar, persistence

## Notes

- Dates are handled in local time (`YYYY-MM-DD`) to avoid timezone shifts.
- Data is stored only in this browser. Clearing site data removes it.
- Tested at desktop and mobile breakpoints, including month boundaries and leap years.
