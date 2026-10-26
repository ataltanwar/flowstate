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


## Install as a PWA

Flowstate can be installed on supported browsers and keeps its app shell available offline.

1. Deploy the repository using HTTPS (GitHub Pages, Vercel, or another static host).
2. Open the deployed URL in Chrome or Edge and choose **Install flowstate** (or use the browser's install option).
3. On iPhone/iPad, open the website in Safari, use **Share**, and choose **Add to Home Screen**.

### Local testing

Run the directory through a local web server; service workers do not work when opening `index.html` directly from `file://`.

```bash
python -m http.server 8080
```

Then open http://localhost:8080.

### Offline behavior and data

- The service worker caches the HTML, CSS, JavaScript, manifest, logo, and app icons.
- Tasks continue to be saved in the browser's existing `localStorage`; this PWA change does not move or sync your data to a server.
- On a first visit, load the app once while online so its app shell can be cached.
- The cache is versioned in `service-worker.js`; increment the version when changing offline-cached files.
