// LifeTrack Data Layer
// All persistence via localStorage

const DB_VERSION = '1.1'; // bump this to wipe stale data on reload

let _idCounter = 0; // ensures uniqueness even within the same millisecond

const DB = {
  KEYS: {
    TASKS: 'lt_tasks',
    COMPLETIONS: 'lt_completions',
    WEIGHT: 'lt_weight',
    SETTINGS: 'lt_settings',
    VERSION: 'lt_version',
  },

  // ── Generic helpers ────────────────────────────────────────────────────────
  _get(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  },
  _set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },

  // ── Tasks ──────────────────────────────────────────────────────────────────
  getTasks() {
    return this._get(this.KEYS.TASKS) || [];
  },
  saveTasks(tasks) {
    this._set(this.KEYS.TASKS, tasks);
  },
  addTask(task) {
    const tasks = this.getTasks();
    // Use timestamp + counter + random to guarantee uniqueness even in tight loops
    task.id = `${Date.now()}_${++_idCounter}_${Math.random().toString(36).slice(2, 7)}`;
    task.active = true;
    tasks.push(task);
    this.saveTasks(tasks);
    return task;
  },
  updateTask(id, updates) {
    const tasks = this.getTasks().map(t => t.id === id ? { ...t, ...updates } : t);
    this.saveTasks(tasks);
  },
  deleteTask(id) {
    const tasks = this.getTasks().filter(t => t.id !== id);
    this.saveTasks(tasks);
    // clean completions
    const comps = this.getAllCompletions();
    for (const date in comps) {
      delete comps[date][id];
    }
    this._set(this.KEYS.COMPLETIONS, comps);
  },
  getActiveTasks() {
    return this.getTasks().filter(t => t.active !== false);
  },
  getTasksDueOn(dateStr) {
    // dateStr: 'YYYY-MM-DD'
    const dow = new Date(dateStr + 'T00:00:00').getDay(); // 0=Sun
    const dayNames = ['sun','mon','tue','wed','thu','fri','sat'];
    return this.getActiveTasks().filter(t => {
      if (t.frequency === 'daily') return true;
      if (t.frequency === 'weekly') {
        // show on whatever day they were created — Sunday
        return dow === 0;
      }
      if (Array.isArray(t.frequency)) {
        return t.frequency.includes(dayNames[dow]);
      }
      return true;
    });
  },

  // ── Completions ────────────────────────────────────────────────────────────
  getAllCompletions() {
    return this._get(this.KEYS.COMPLETIONS) || {};
  },
  getCompletionsForDate(dateStr) {
    const all = this.getAllCompletions();
    return all[dateStr] || {};
  },
  setCompletion(dateStr, taskId, completed) {
    const all = this.getAllCompletions();
    if (!all[dateStr]) all[dateStr] = {};
    all[dateStr][taskId] = completed;
    this._set(this.KEYS.COMPLETIONS, all);
  },
  getDailyScore(dateStr) {
    const due = this.getTasksDueOn(dateStr);
    if (due.length === 0) return null;
    const comps = this.getCompletionsForDate(dateStr);
    const done = due.filter(t => comps[t.id]).length;
    return { done, total: due.length, pct: Math.round((done / due.length) * 100) };
  },

  // ── Weight ─────────────────────────────────────────────────────────────────
  getWeightEntries() {
    return (this._get(this.KEYS.WEIGHT) || []).sort((a,b) => a.date.localeCompare(b.date));
  },
  addWeightEntry(date, weight) {
    const entries = this.getWeightEntries();
    // replace if same date
    const idx = entries.findIndex(e => e.date === date);
    if (idx >= 0) entries[idx].weight = weight;
    else entries.push({ date, weight: parseFloat(weight) });
    this._set(this.KEYS.WEIGHT, entries.sort((a,b) => a.date.localeCompare(b.date)));
  },
  deleteWeightEntry(date) {
    const entries = this.getWeightEntries().filter(e => e.date !== date);
    this._set(this.KEYS.WEIGHT, entries);
  },

  // ── Settings ───────────────────────────────────────────────────────────────
  getSettings() {
    return this._get(this.KEYS.SETTINGS) || {
      targetWeight: 70,
      startWeight: null,
      units: 'kg',
      theme: 'dark',
    };
  },
  saveSettings(updates) {
    const s = { ...this.getSettings(), ...updates };
    this._set(this.KEYS.SETTINGS, s);
    return s;
  },

  // ── Analytics helpers ──────────────────────────────────────────────────────
  getLast30Days() {
    const dates = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(formatDate(d));
    }
    return dates;
  },
  getStreaks() {
    const today = formatDate(new Date());
    let current = 0, longest = 0, temp = 0;
    const dates = [];
    for (let i = 0; i < 365; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(formatDate(d));
    }
    dates.reverse();
    for (const date of dates) {
      const score = this.getDailyScore(date);
      if (score && score.done > 0 && score.pct >= 50) {
        temp++;
        if (temp > longest) longest = temp;
      } else {
        temp = 0;
      }
    }
    // current streak (going back from today)
    for (let i = 0; i < 365; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = formatDate(d);
      const score = this.getDailyScore(ds);
      if (score && score.done > 0 && score.pct >= 50) {
        current++;
      } else {
        break;
      }
    }
    return { current, longest };
  },
  getWeeklyStats() {
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const result = [];
    // Get the current week (Mon-Sun)
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = formatDate(d);
      const score = this.getDailyScore(ds);
      result.push({
        label: dayNames[d.getDay()],
        date: ds,
        pct: score ? score.pct : null,
        done: score ? score.done : 0,
        total: score ? score.total : 0,
      });
    }
    return result;
  },

  // ── Version check — wipe stale data if version mismatch ───────────────────
  checkVersion() {
    const stored = this._get(this.KEYS.VERSION);
    if (stored !== DB_VERSION) {
      // Clear everything and re-seed with correct IDs
      Object.values(this.KEYS).forEach(k => localStorage.removeItem(k));
      this._set(this.KEYS.VERSION, DB_VERSION);
      this.seedDemoData();
    }
  },

  // ── Seed demo data ─────────────────────────────────────────────────────────
  seedDemoData() {
    if (this.getTasks().length > 0) return; // already seeded

    const tasks = [
      { name: 'Jogging', category: 'Fitness', group: 'Morning', frequency: 'daily' },
      { name: 'Gym', category: 'Fitness', group: 'Morning', frequency: ['mon','wed','fri'] },
      { name: 'Online Class', category: 'Learning', group: 'Afternoon', frequency: 'daily' },
      { name: 'Bank Exam Prep', category: 'Career', group: 'Afternoon', frequency: 'daily' },
      { name: 'Typing Practice', category: 'Career', group: 'Evening', frequency: 'daily' },
      { name: 'Coding Practice', category: 'Career', group: 'Evening', frequency: 'daily' },
      { name: 'Sleep on Time', category: 'Health', group: 'Night', frequency: 'daily' },
    ];
    tasks.forEach(t => this.addTask(t));

    // Seed some historical completions (last 14 days)
    const taskList = this.getTasks();
    for (let i = 14; i >= 1; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = formatDate(d);
      const dueTasks = this.getTasksDueOn(ds);
      dueTasks.forEach(t => {
        // ~75% completion rate for realistic demo
        if (Math.random() > 0.25) {
          this.setCompletion(ds, t.id, true);
        }
      });
    }

    // Seed weight data
    const baseWeight = 91;
    for (let i = 14; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i * 2);
      const w = baseWeight - (14 - i) * 0.3 + (Math.random() - 0.5) * 0.4;
      this.addWeightEntry(formatDate(d), parseFloat(w.toFixed(1)));
    }

    this.saveSettings({ targetWeight: 70, startWeight: 91, units: 'kg', theme: 'dark' });
  },
};

// ── Date utilities ─────────────────────────────────────────────────────────────
function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDateDisplay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function todayStr() {
  return formatDate(new Date());
}

function friendlyDate(d = new Date()) {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
