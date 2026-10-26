'use strict';

/* ============================================================
   flowstate — script
   Part 1: constants, date helpers, state, storage
   ============================================================ */

const STORAGE_KEY = 'flowstate.tasks.v1';

const PRIORITY_META = {
  urgent: { label: 'Urgent' },
  important: { label: 'Important' },
  normal: { label: 'Normal' },
  low: { label: 'Low' },
};

const PRIORITY_ORDER = ['urgent', 'important', 'normal', 'low'];
const DAY_LABELS = ['Today', 'Tomorrow', 'Day after tomorrow'];

const FILTER_EMPTY = {
  all: ['No tasks yet', 'Create your first task with the + button.'],
  inbox: ['Inbox is empty', 'Capture something without a date from the task form.'],
  completed: ['Nothing completed yet', 'Checked-off tasks will appear here.'],
};

const CHECK_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/* ---------- Date helpers (all local-time, no timezone shifts) ---------- */

function pad2(value) {
  return String(value).padStart(2, '0');
}

function dateToISO(date) {
  return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
}

function isoToDate(iso) {
  const parts = String(iso).split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function isValidISODate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const date = isoToDate(value);
  return !Number.isNaN(date.getTime()) && dateToISO(date) === value;
}

function todayDate() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function todayISO() {
  return dateToISO(todayDate());
}

function addDays(date, amount) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + amount);
  return next;
}

function addDaysISO(iso, amount) {
  return dateToISO(addDays(isoToDate(iso), amount));
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

const longDateFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});
const shortDateFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short', day: 'numeric', month: 'short',
});
const dayNameFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long' });
const monthYearFmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const dayMonthYearFmt = new Intl.DateTimeFormat(undefined, {
  day: 'numeric', month: 'long', year: 'numeric',
});
const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
});

function friendlyDate(iso) {
  if (!iso) return 'Inbox \u00b7 no date';
  const today = todayISO();
  if (iso === today) return 'Today';
  if (iso === addDaysISO(today, 1)) return 'Tomorrow';
  if (iso === addDaysISO(today, -1)) return 'Yesterday';
  return shortDateFmt.format(isoToDate(iso));
}

/* ---------- App state ---------- */

let tasks = [];
let currentView = 'today';
let selectedDate = todayISO();
let calendarCursor = {
  year: todayDate().getFullYear(),
  month: todayDate().getMonth(),
};
let activeFilter = 'all';
let editingId = null;
let lastKnownToday = todayISO();
let toastTimer = null;
let pendingUndo = null;
let draggedTaskId = null;

/* ---------- Storage ---------- */

function makeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try { return crypto.randomUUID(); } catch (error) { /* fall through */ }
  }
  return 'task-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

function safeTimestamp(value, fallback) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

function sanitizeTask(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!title) return null;
  const now = new Date().toISOString();
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : makeId(),
    title: title.slice(0, 500),
    scheduledDate: isValidISODate(raw.scheduledDate) ? raw.scheduledDate : null,
    priority: Object.prototype.hasOwnProperty.call(PRIORITY_META, raw.priority)
      ? raw.priority
      : 'normal',
    completed: Boolean(raw.completed),
    notes: typeof raw.notes === 'string' ? raw.notes.slice(0, 5000) : '',
    createdAt: safeTimestamp(raw.createdAt, now),
    updatedAt: safeTimestamp(raw.updatedAt, now),
  };
}

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeTask).filter(Boolean);
  } catch (error) {
    console.warn('Flowstate: could not load saved tasks.', error);
    return [];
  }
}

function persistTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (error) {
    console.warn('Flowstate: could not save tasks.', error);
    showToast('Could not save to this browser.');
  }
}

/* ---------- Task queries ---------- */

function getTask(id) {
  return tasks.find(function (task) { return task.id === id; }) || null;
}

function tasksForDate(iso) {
  return tasks
    .filter(function (task) { return task.scheduledDate === iso; })
    .sort(function (a, b) { return a.createdAt.localeCompare(b.createdAt); });
}

function priorityRank(task) {
  return PRIORITY_ORDER.indexOf(task.priority);
}

/* ---------- DOM references ---------- */

const els = {
  todayHeading: document.getElementById('today-heading'),
  todayDate: document.getElementById('today-date'),
  todayTime: document.getElementById('today-time'),
  dayCards: document.getElementById('day-cards'),
  openTasksCount: document.getElementById('open-tasks-count'),
  openTasksList: document.getElementById('open-tasks-list'),

  calendarTitle: document.getElementById('calendar-title'),
  calendarGrid: document.getElementById('calendar-grid'),
  selectedDayTitle: document.getElementById('selected-day-title'),
  selectedDayCount: document.getElementById('selected-day-count'),
  calendarTaskList: document.getElementById('calendar-task-list'),

  tasksSub: document.getElementById('tasks-sub'),
  tasksList: document.getElementById('tasks-list'),
  filterButtons: Array.prototype.slice.call(document.querySelectorAll('[data-filter]')),

  taskDialog: document.getElementById('task-dialog'),
  taskForm: document.getElementById('task-form'),
  dialogTitle: document.getElementById('dialog-title'),
  taskTitleInput: document.getElementById('task-title'),
  taskDateInput: document.getElementById('task-date'),
  taskDateLabel: document.getElementById('task-date-label'),
  taskPriorityInput: document.getElementById('task-priority'),
  taskInboxInput: document.getElementById('task-inbox'),
  taskNotesInput: document.getElementById('task-notes'),
  moreOptions: document.getElementById('more-options'),
  formError: document.getElementById('form-error'),
  saveButton: document.getElementById('save-task'),
  deleteButton: document.getElementById('delete-task'),

  dayDialog: document.getElementById('day-dialog'),
  dayDialogTitle: document.getElementById('day-dialog-title'),
  dayDialogSub: document.getElementById('day-dialog-sub'),
  dayDialogList: document.getElementById('day-dialog-list'),
  dayDialogAdd: document.getElementById('day-dialog-add'),

  toast: document.getElementById('toast'),
};

/* ---------- Small DOM helpers ---------- */

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function showToast(message, action) {
  pendingUndo = action || null;
  els.toast.replaceChildren();
  els.toast.append(el('span', 'toast-message', message));

  if (action) {
    const undoButton = el('button', 'toast-action', action.label);
    undoButton.type = 'button';
    undoButton.addEventListener('click', function () {
      if (!pendingUndo) return;
      const undo = pendingUndo;
      pendingUndo = null;
      undo.handler();
      els.toast.classList.remove('is-visible');
    });
    els.toast.append(undoButton);
  }

  els.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    pendingUndo = null;
    els.toast.classList.remove('is-visible');
  }, 2200);
}

function buildPriorityDot(task) {
  const meta = PRIORITY_META[task.priority] || PRIORITY_META.normal;
  const dot = el('span', 'priority-dot priority--' + task.priority);
  dot.setAttribute('role', 'img');
  dot.setAttribute('aria-label', meta.label + ' priority');
  dot.title = meta.label + ' priority';
  return dot;
}

function buildCheckbox(task) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'checkbox';
  button.setAttribute('role', 'checkbox');
  button.setAttribute('aria-checked', String(task.completed));
  button.setAttribute('aria-label',
    (task.completed ? 'Mark as not completed: ' : 'Complete: ') + task.title);
  button.dataset.action = 'toggle-task';
  button.dataset.id = task.id;
  button.innerHTML = CHECK_ICON;
  return button;
}

function buildTaskRow(task, options) {
  const opts = options || {};
  const row = el('li', 'task-row');
  row.dataset.id = task.id;
  if (opts.draggable && !task.completed) {
    row.draggable = true;
    row.classList.add('is-draggable');
    row.setAttribute('aria-label', 'Drag to reschedule: ' + task.title);
  }
  if (task.completed) row.classList.add('is-completed');

  row.append(buildPriorityDot(task), buildCheckbox(task));

  const main = el('div', 'task-main');
  const titleButton = el('button', 'task-title', task.title);
  titleButton.type = 'button';
  titleButton.dataset.action = 'edit-task';
  titleButton.dataset.id = task.id;
  main.append(titleButton);

  if (opts.showMeta) {
    main.append(el('span', 'task-meta', friendlyDate(task.scheduledDate)));
  }
  row.append(main);

  if (opts.showSchedule && task.scheduledDate === null) {
    const schedule = el('button', 'schedule-btn', 'Schedule');
    schedule.type = 'button';
    schedule.dataset.action = 'assign-date';
    schedule.dataset.id = task.id;
    schedule.setAttribute('aria-label', 'Assign a date to: ' + task.title);
    row.append(schedule);
  }

  return row;
}

function renderTaskList(container, list, options) {
  const opts = options || {};
  container.replaceChildren();

  if (!list.length) {
    const empty = el('div', 'empty-state');
    empty.append(el('p', 'empty-title', opts.emptyTitle || 'Nothing here'));
    if (opts.emptyHint) empty.append(el('p', 'empty-hint', opts.emptyHint));
    container.append(empty);
    return;
  }

  const ul = el('ul', 'task-list');
  list.forEach(function (task) {
    ul.append(buildTaskRow(task, opts));
  });
  container.append(ul);
}

/* ---------- Today rendering ---------- */

function buildDayCard(iso, label, index) {
  const card = el('article', 'day-card');
  card.dataset.dropDate = iso;
  card.setAttribute('aria-label', 'Drop open tasks to ' + longDateFmt.format(isoToDate(iso)));
  if (index === 0) card.classList.add('day-card--today');

  const head = document.createElement('button');
  head.type = 'button';
  head.className = 'day-card-head';
  head.dataset.action = 'open-day';
  head.dataset.date = iso;
  head.setAttribute('aria-label', 'Open day view for ' + longDateFmt.format(isoToDate(iso)));

  const text = el('div', 'day-head-text');
  text.append(el('span', 'day-label', label));
  text.append(el('span', 'day-date', shortDateFmt.format(isoToDate(iso))));

  const dayTasks = tasksForDate(iso);
  const done = dayTasks.filter(function (task) { return task.completed; }).length;
  const count = el('span', 'day-count',
    dayTasks.length ? done + '/' + dayTasks.length + ' done' : 'No tasks');

  head.append(text, count);
  card.append(head);

  const listWrap = el('div', 'day-tasks');
  renderTaskList(listWrap, dayTasks, {
    emptyTitle: 'Nothing planned yet',
    emptyHint: index === 0 ? 'Tap + to add your first task.' : 'A clear day.',
  });
  card.append(listWrap);

  return card;
}

function renderToday() {
  const today = todayDate();
  const now = new Date();

  els.todayHeading.textContent = dayNameFmt.format(today);
  els.todayDate.textContent = dayMonthYearFmt.format(today);
  els.todayTime.textContent = timeFmt.format(now);

  els.dayCards.replaceChildren();
  for (let i = 0; i < 3; i += 1) {
    const iso = dateToISO(addDays(today, i));
    els.dayCards.append(buildDayCard(iso, DAY_LABELS[i], i));
  }

  renderOpenTasks();
}

function renderOpenTasks() {
  const openTasks = tasks
    .filter(function (task) { return !task.completed; })
    .sort(function (a, b) {
      if (a.scheduledDate === null && b.scheduledDate !== null) return 1;
      if (a.scheduledDate !== null && b.scheduledDate === null) return -1;
      if (a.scheduledDate !== b.scheduledDate) {
        return (a.scheduledDate || '') < (b.scheduledDate || '') ? -1 : 1;
      }
      const byPriority = priorityRank(a) - priorityRank(b);
      return byPriority !== 0 ? byPriority : a.createdAt.localeCompare(b.createdAt);
    });

  els.openTasksCount.textContent = openTasks.length
    ? openTasks.length + (openTasks.length === 1 ? ' task' : ' tasks')
    : 'All clear';
  els.openTasksList.replaceChildren();

  if (!openTasks.length) {
    const empty = el('div', 'empty-state');
    empty.append(
      el('p', 'empty-title', 'No open tasks'),
      el('p', 'empty-hint', 'Completed tasks will stay out of this list.')
    );
    els.openTasksList.append(empty);
    return;
  }

  const groups = [];
  openTasks.forEach(function (task) {
    const key = task.scheduledDate || 'inbox';
    let group = groups.find(function (item) { return item.key === key; });
    if (!group) {
      group = { key: key, tasks: [] };
      groups.push(group);
    }
    group.tasks.push(task);
  });

  if (!groups.some(function (group) { return group.key === 'inbox'; })) {
    groups.push({ key: 'inbox', tasks: [] });
  }

  groups.forEach(function (group) {
    const section = el('section', 'open-task-group');
    section.dataset.dropDate = group.key;
    section.setAttribute('aria-label', 'Drop tasks to ' +
      (group.key === 'inbox' ? 'Inbox' : longDateFmt.format(isoToDate(group.key))));
    const title = group.key === 'inbox'
      ? 'Inbox'
      : longDateFmt.format(isoToDate(group.key));
    section.append(el('h3', 'open-task-group-title', title));
    const list = el('div', 'open-task-group-list');
    renderTaskList(list, group.tasks, {
      showMeta: false,
      draggable: true,
      emptyTitle: 'Drop tasks here',
      emptyHint: 'Drag an open task to this group.',
    });
    section.append(list);
    els.openTasksList.append(section);
  });
}

function clearDragTargets() {
  document.querySelectorAll('.is-drag-over').forEach(function (target) {
    target.classList.remove('is-drag-over');
  });
}

function moveTaskToDate(id, scheduledDate) {
  const task = getTask(id);
  if (!task || task.completed) return;

  const previousDate = task.scheduledDate;
  if (previousDate === scheduledDate) return;

  task.scheduledDate = scheduledDate;
  task.updatedAt = new Date().toISOString();
  persistTasks();
  renderAll();

  showToast(scheduledDate ? 'Task moved to ' + friendlyDate(scheduledDate) : 'Task moved to Inbox', {
    label: 'Undo',
    handler: function () {
      const currentTask = getTask(id);
      if (!currentTask || currentTask.scheduledDate !== scheduledDate) return;
      currentTask.scheduledDate = previousDate;
      currentTask.updatedAt = new Date().toISOString();
      persistTasks();
      renderAll();
      showToast('Move undone');
    },
  });
}

function handleDragStart(event) {
  const row = event.target.closest('.task-row.is-draggable');
  if (!row) return;

  draggedTaskId = row.dataset.id;
  row.classList.add('is-dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', draggedTaskId);
}

function handleDragOver(event) {
  if (!draggedTaskId) return;
  const target = event.target.closest('[data-drop-date]');
  if (!target) return;

  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  clearDragTargets();
  target.classList.add('is-drag-over');
}

function handleDrop(event) {
  if (!draggedTaskId) return;
  const target = event.target.closest('[data-drop-date]');
  if (!target) return;

  event.preventDefault();
  const destination = target.dataset.dropDate;
  clearDragTargets();
  moveTaskToDate(draggedTaskId, destination === 'inbox' ? null : destination);
  draggedTaskId = null;
}

function handleDragEnd(event) {
  const row = event.target.closest('.task-row.is-draggable');
  if (row) row.classList.remove('is-dragging');
  draggedTaskId = null;
  clearDragTargets();
}

/* ---------- Calendar rendering ---------- */

function renderCalendar() {
  const year = calendarCursor.year;
  const month = calendarCursor.month;

  els.calendarTitle.textContent = monthYearFmt.format(new Date(year, month, 1));

  const grid = els.calendarGrid;
  grid.replaceChildren();

  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const totalDays = daysInMonth(year, month);
  const today = todayISO();

  for (let i = 0; i < firstWeekday; i += 1) {
    const blank = el('div', 'cal-blank');
    blank.setAttribute('aria-hidden', 'true');
    grid.append(blank);
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const iso = year + '-' + pad2(month + 1) + '-' + pad2(day);
    const hasTasks = tasks.some(function (task) { return task.scheduledDate === iso; });

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cal-day';
    cell.dataset.action = 'select-day';
    cell.dataset.date = iso;
    cell.textContent = String(day);

    if (hasTasks) cell.classList.add('has-tasks');
    if (iso === today) cell.classList.add('is-today');

    if (iso === selectedDate) {
      cell.classList.add('is-selected');
      cell.setAttribute('aria-pressed', 'true');
    } else {
      cell.setAttribute('aria-pressed', 'false');
    }

    cell.setAttribute('aria-label',
      longDateFmt.format(isoToDate(iso)) + (hasTasks ? ', has tasks' : ', no tasks'));

    grid.append(cell);
  }

  const trailing = (7 - ((firstWeekday + totalDays) % 7)) % 7;
  for (let i = 0; i < trailing; i += 1) {
    const blank = el('div', 'cal-blank');
    blank.setAttribute('aria-hidden', 'true');
    grid.append(blank);
  }

  renderSelectedDay();
}

function renderSelectedDay() {
  const list = tasksForDate(selectedDate);
  const done = list.filter(function (task) { return task.completed; }).length;

  els.selectedDayTitle.textContent = longDateFmt.format(isoToDate(selectedDate));
  els.selectedDayCount.textContent = list.length
    ? done + ' of ' + list.length + ' completed'
    : 'No tasks scheduled';

  renderTaskList(els.calendarTaskList, list, {
    emptyTitle: 'Nothing scheduled',
    emptyHint: 'Add a task for this date.',
  });
}

/* ---------- Tasks screen rendering ---------- */

function sortForAll(a, b) {
  if (a.completed !== b.completed) return a.completed ? 1 : -1;

  const aInbox = a.scheduledDate === null;
  const bInbox = b.scheduledDate === null;
  if (aInbox !== bInbox) return aInbox ? 1 : -1;
  if (!aInbox && a.scheduledDate !== b.scheduledDate) {
    return a.scheduledDate < b.scheduledDate ? -1 : 1;
  }

  const byPriority = priorityRank(a) - priorityRank(b);
  if (byPriority !== 0) return byPriority;
  return a.createdAt.localeCompare(b.createdAt);
}

function sortInbox(a, b) {
  if (a.completed !== b.completed) return a.completed ? 1 : -1;
  const byPriority = priorityRank(a) - priorityRank(b);
  if (byPriority !== 0) return byPriority;
  return a.createdAt.localeCompare(b.createdAt);
}

function sortCompleted(a, b) {
  return b.updatedAt.localeCompare(a.updatedAt);
}

function renderTasks() {
  const inboxCount = tasks.filter(function (task) { return task.scheduledDate === null; }).length;
  const completedCount = tasks.filter(function (task) { return task.completed; }).length;

  els.tasksSub.textContent = tasks.length
    ? tasks.length + (tasks.length === 1 ? ' task' : ' tasks') +
      ' \u00b7 ' + inboxCount + ' in inbox \u00b7 ' + completedCount + ' completed'
    : 'Everything you have captured, in one place.';

  els.filterButtons.forEach(function (button) {
    const isActive = button.dataset.filter === activeFilter;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });

  let list;
  if (activeFilter === 'inbox') {
    list = tasks.filter(function (task) { return task.scheduledDate === null; }).sort(sortInbox);
  } else if (activeFilter === 'completed') {
    list = tasks.filter(function (task) { return task.completed; }).sort(sortCompleted);
  } else {
    list = tasks.slice().sort(sortForAll);
  }

  const empty = FILTER_EMPTY[activeFilter] || FILTER_EMPTY.all;
  renderTaskList(els.tasksList, list, {
    showMeta: true,
    showSchedule: activeFilter === 'inbox',
    emptyTitle: empty[0],
    emptyHint: empty[1],
  });
}

/* ---------- Global render + navigation ---------- */

function renderAll() {
  renderToday();
  renderCalendar();
  renderTasks();
  syncNav();
}

function syncNav() {
  document.querySelectorAll('[data-nav]').forEach(function (button) {
    const isActive = button.dataset.nav === currentView;
    button.classList.toggle('is-active', isActive);
    if (isActive) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
}

function navigateTo(view) {
  if (view !== 'today' && view !== 'calendar' && view !== 'tasks') return;
  currentView = view;

  document.querySelectorAll('.view').forEach(function (section) {
    section.hidden = section.id !== 'view-' + view;
  });

  syncNav();
  window.scrollTo(0, 0);
}

function updateClock() {
  const now = new Date();
  const iso = dateToISO(now);

  if (iso !== lastKnownToday) {
    lastKnownToday = iso;
    selectedDate = iso;
    calendarCursor = { year: now.getFullYear(), month: now.getMonth() };
    renderAll();
    return;
  }

  if (els.todayTime) els.todayTime.textContent = timeFmt.format(now);
}

/* ============================================================
   Part 3: dialogs, CRUD, events, initialization
   ============================================================ */

let dialogFallbackDate = todayISO();
let dialogSavedDate = '';

function showFormError(message) {
  els.formError.textContent = message;
  els.formError.hidden = false;
}

function hideFormError() {
  els.formError.hidden = true;
  els.formError.textContent = '';
}

function openTaskDialog(options) {
  const opts = options || {};
  const task = opts.task || null;
  const forceSchedule = Boolean(opts.forceSchedule);

  editingId = task ? task.id : null;

  let inboxChecked = task ? task.scheduledDate === null : Boolean(opts.inbox);
  if (forceSchedule) inboxChecked = false;

  let dateValue = '';
  if (!forceSchedule) {
    if (task) dateValue = task.scheduledDate || '';
    else if (!inboxChecked) dateValue = opts.date || todayISO();
  }

  dialogFallbackDate = opts.date || todayISO();
  dialogSavedDate = dateValue;

  els.dialogTitle.textContent = task ? 'Edit task' : 'New task';
  els.saveButton.textContent = task ? 'Save changes' : 'Create task';
  els.deleteButton.hidden = !task;

  els.taskTitleInput.value = task ? task.title : '';
  els.taskPriorityInput.value = task ? task.priority : 'normal';
  els.taskNotesInput.value = task ? task.notes : '';
  els.taskInboxInput.checked = inboxChecked;
  els.taskDateInput.value = dateValue;
  els.taskDateInput.disabled = inboxChecked;
  els.taskDateLabel.textContent = inboxChecked ? 'Date \u00b7 Inbox' : 'Date';
  els.moreOptions.open = Boolean(task && task.notes);

  hideFormError();

  if (!els.taskDialog.open) els.taskDialog.showModal();

  window.requestAnimationFrame(function () {
    if (opts.focusDate || forceSchedule) {
      els.taskDateInput.focus();
    } else {
      els.taskTitleInput.focus();
    }
  });
}

function handleInboxToggle() {
  const isInbox = els.taskInboxInput.checked;

  if (isInbox) {
    dialogSavedDate = els.taskDateInput.value || dialogSavedDate;
    els.taskDateInput.value = '';
  } else {
    els.taskDateInput.value = dialogSavedDate || dialogFallbackDate;
  }

  els.taskDateInput.disabled = isInbox;
  els.taskDateLabel.textContent = isInbox ? 'Date \u00b7 Inbox' : 'Date';
  hideFormError();
}

function handleTaskSubmit(event) {
  event.preventDefault();

  const title = els.taskTitleInput.value.trim();
  const inbox = els.taskInboxInput.checked;
  const rawDate = els.taskDateInput.value;

  if (!title) {
    showFormError('Please enter a task title.');
    els.taskTitleInput.focus();
    return;
  }

  if (!inbox && !isValidISODate(rawDate)) {
    showFormError('Choose a date, or switch on \u201cSave to Inbox\u201d.');
    els.taskDateInput.focus();
    return;
  }

  const priority = Object.prototype.hasOwnProperty.call(PRIORITY_META, els.taskPriorityInput.value)
    ? els.taskPriorityInput.value
    : 'normal';
  const notes = els.taskNotesInput.value.trim();
  const now = new Date().toISOString();

  if (editingId) {
    const task = getTask(editingId);
    if (task) {
      task.title = title;
      task.scheduledDate = inbox ? null : rawDate;
      task.priority = priority;
      task.notes = notes;
      task.updatedAt = now;
    }
    persistTasks();
    els.taskDialog.close();
    editingId = null;
    renderAll();
    showToast('Task updated');
  } else {
    tasks.push({
      id: makeId(),
      title: title,
      scheduledDate: inbox ? null : rawDate,
      priority: priority,
      completed: false,
      notes: notes,
      createdAt: now,
      updatedAt: now,
    });
    persistTasks();
    els.taskDialog.close();
    renderAll();
    showToast(inbox ? 'Saved to Inbox' : 'Task created');
  }
}

function deleteEditingTask() {
  if (!editingId) return;
  const task = getTask(editingId);
  if (!task) return;

  const confirmed = window.confirm('Delete \u201c' + task.title + '\u201d? This cannot be undone.');
  if (!confirmed) return;

  tasks = tasks.filter(function (item) { return item.id !== editingId; });
  persistTasks();
  els.taskDialog.close();
  editingId = null;
  renderAll();
  showToast('Task deleted');
}

function toggleTask(id, context) {
  const task = getTask(id);
  if (!task) return;

  task.completed = !task.completed;
  task.updatedAt = new Date().toISOString();
  persistTasks();
  renderAll();

  if (els.dayDialog.open) renderDayDialog(els.dayDialog.dataset.date);

  if (context && context.isConnected) {
    const next = Array.prototype.slice
      .call(context.querySelectorAll('[data-action="toggle-task"]'))
      .find(function (node) { return node.dataset.id === id; });
    if (next) next.focus({ preventScroll: true });
  }
}

/* ---------- Day view ---------- */

function renderDayDialog(iso) {
  const list = tasksForDate(iso);
  const done = list.filter(function (task) { return task.completed; }).length;

  els.dayDialogTitle.textContent = longDateFmt.format(isoToDate(iso));
  els.dayDialogSub.textContent = list.length
    ? done + ' of ' + list.length + ' completed'
    : 'No tasks for this day';
  els.dayDialogAdd.dataset.date = iso;

  renderTaskList(els.dayDialogList, list, {
    emptyTitle: 'Nothing planned',
    emptyHint: 'Add the first task for this day.',
  });
}

function openDayView(iso) {
  if (!isValidISODate(iso)) return;
  els.dayDialog.dataset.date = iso;
  renderDayDialog(iso);
  if (!els.dayDialog.open) els.dayDialog.showModal();
}

/* ---------- Calendar movement ---------- */

function shiftMonth(delta) {
  const target = new Date(calendarCursor.year, calendarCursor.month + delta, 1);
  calendarCursor = { year: target.getFullYear(), month: target.getMonth() };

  const maxDay = daysInMonth(calendarCursor.year, calendarCursor.month);
  const wantedDay = Math.min(isoToDate(selectedDate).getDate(), maxDay);
  selectedDate = dateToISO(new Date(calendarCursor.year, calendarCursor.month, wantedDay));

  renderCalendar();
}

function continueToCalendar() {
  const third = addDaysISO(todayISO(), 2);
  const date = isoToDate(third);

  selectedDate = third;
  calendarCursor = { year: date.getFullYear(), month: date.getMonth() };

  navigateTo('calendar');
  renderCalendar();
}

function handleAddTask() {
  if (currentView === 'calendar') {
    openTaskDialog({ date: selectedDate });
    return;
  }
  if (currentView === 'tasks' && activeFilter === 'inbox') {
    openTaskDialog({ inbox: true });
    return;
  }
  openTaskDialog({ date: todayISO() });
}

/* ---------- Event handling ---------- */

function handleGlobalClick(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;

  const action = target.dataset.action;

  switch (action) {
    case 'toggle-task': {
      event.preventDefault();
      const context = target.closest('.view') || target.closest('dialog');
      toggleTask(target.dataset.id, context);
      break;
    }

    case 'edit-task': {
      const task = getTask(target.dataset.id);
      if (!task) break;
      if (els.dayDialog.open) els.dayDialog.close();
      openTaskDialog({ task: task });
      break;
    }

    case 'assign-date': {
      const task = getTask(target.dataset.id);
      if (!task) break;
      if (els.dayDialog.open) els.dayDialog.close();
      openTaskDialog({ task: task, forceSchedule: true, focusDate: true });
      break;
    }

    case 'add-task':
      handleAddTask();
      break;

    case 'add-task-selected':
      openTaskDialog({ date: selectedDate });
      break;

    case 'add-task-for-day': {
      const date = target.dataset.date;
      if (els.dayDialog.open) els.dayDialog.close();
      openTaskDialog({ date: date || todayISO() });
      break;
    }

    case 'open-day':
      openDayView(target.dataset.date);
      break;

    case 'close-dialog': {
      const dialog = target.closest('dialog');
      if (dialog) dialog.close();
      break;
    }

    case 'delete-task':
      deleteEditingTask();
      break;

    case 'calendar-prev':
      shiftMonth(-1);
      break;

    case 'calendar-next':
      shiftMonth(1);
      break;

    case 'select-day':
      if (isValidISODate(target.dataset.date)) {
        selectedDate = target.dataset.date;
        renderCalendar();
      }
      break;

    case 'continue-calendar':
      continueToCalendar();
      break;

    default:
      break;
  }
}

function bindEvents() {
  document.addEventListener('click', handleGlobalClick);
  document.addEventListener('dragstart', handleDragStart);
  document.addEventListener('dragover', handleDragOver);
  document.addEventListener('drop', handleDrop);
  document.addEventListener('dragend', handleDragEnd);

  document.querySelectorAll('[data-nav]').forEach(function (button) {
    button.addEventListener('click', function () {
      navigateTo(button.dataset.nav);
    });
  });

  els.filterButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      activeFilter = button.dataset.filter;
      renderTasks();
    });
  });

  els.taskForm.addEventListener('submit', handleTaskSubmit);
  els.taskInboxInput.addEventListener('change', handleInboxToggle);

  els.taskTitleInput.addEventListener('input', hideFormError);
  els.taskDateInput.addEventListener('input', hideFormError);

  [els.taskDialog, els.dayDialog].forEach(function (dialog) {
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) dialog.close();
    });
  });

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) updateClock();
  });
}

/* ---------- Start ---------- */

function init() {
  tasks = loadTasks();

  const now = new Date();
  selectedDate = dateToISO(now);
  calendarCursor = { year: now.getFullYear(), month: now.getMonth() };
  lastKnownToday = dateToISO(now);

  bindEvents();
  renderAll();
  navigateTo('today');

  setInterval(updateClock, 1000);
}

init();
