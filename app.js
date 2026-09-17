// LifeTrack — Main Application Logic
'use strict';

// ── App state ──────────────────────────────────────────────────────────────────
const State = {
  currentPage: 'today',
  editingTaskId: null,
};

// ── Routing ────────────────────────────────────────────────────────────────────
function navigate(page) {
  State.currentPage = page;

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });

  destroyAllCharts();
  renderPage(page);
}

function renderPage(page) {
  const content = document.getElementById('page-content');
  content.innerHTML = '';
  content.className = 'page-content page-section';

  switch (page) {
    case 'today':    renderToday(content);    break;
    case 'progress': renderProgress(content); break;
    case 'weight':   renderWeight(content);   break;
    case 'settings': renderSettings(content); break;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PAGE: TODAY
// ══════════════════════════════════════════════════════════════════════════════
function renderToday(el) {
  const today = todayStr();
  const tasks = DB.getTasksDueOn(today);
  const comps = DB.getCompletionsForDate(today);
  const settings = DB.getSettings();
  const streaks = DB.getStreaks();

  const done  = tasks.filter(t => comps[t.id]).length;
  const total = tasks.length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

  // Group tasks by time-of-day group
  const groups = { Morning: [], Afternoon: [], Evening: [], Night: [], Other: [] };
  const groupIcons = { Morning: '🌅', Afternoon: '☀️', Evening: '🌆', Night: '🌙', Other: '📌' };
  tasks.forEach(t => {
    const g = groups[t.group] ? t.group : 'Other';
    groups[g].push(t);
  });

  const noTasks = total === 0;

  el.innerHTML = `
    ${pageHeader('LifeTrack', `<span class="date-badge">${friendlyDate()}</span>`, `
      <button class="icon-btn" id="theme-toggle-today" title="Toggle theme">🌓</button>
    `)}

    <div class="card">
      <div class="card-title">Today's Progress</div>
      <div class="progress-hero">
        <div class="ring-wrap">
          <canvas id="doughnut-canvas"></canvas>
          <div class="ring-center">
            <div class="ring-pct">${pct}%</div>
            <div class="ring-label">done</div>
          </div>
        </div>
        <div class="progress-meta">
          <div class="big-done">${done}<span>/${total}</span></div>
          <div class="progress-sub">${done === total && total > 0 ? '🎉 Perfect day!' : `${total - done} task${total - done !== 1 ? 's' : ''} remaining`}</div>
          ${streaks.current > 0 ? `<div class="streak-chip">🔥 ${streaks.current}-day streak</div>` : ''}
        </div>
      </div>
    </div>

    ${noTasks ? `
      <div class="empty-state">
        <span class="empty-icon">📋</span>
        <p>No tasks for today.<br>Add some tasks in the <strong>Settings</strong> tab.</p>
      </div>
    ` : Object.entries(groups).map(([group, gtasks]) => {
      if (gtasks.length === 0) return '';
      return `
        <div class="task-group">
          <div class="task-group-label">
            <span>${groupIcons[group]}</span>
            ${group}
          </div>
          ${gtasks.map(t => taskItemHTML(t, !!comps[t.id])).join('')}
        </div>
      `;
    }).join('')}
  `;

  // Render doughnut
  setTimeout(() => {
    renderDoughnut('doughnut-canvas', done, Math.max(total, 1));
  }, 50);

  // Bind task checkboxes
  el.querySelectorAll('.task-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      const wasCompleted = item.classList.contains('completed');
      DB.setCompletion(today, id, !wasCompleted);

      item.classList.toggle('completed', !wasCompleted);
      if (!wasCompleted) item.classList.add('just-checked');
      setTimeout(() => item.classList.remove('just-checked'), 400);

      const chk = item.querySelector('.task-checkbox');
      chk.textContent = !wasCompleted ? '✓' : '';

      item.querySelector('.task-name').style.textDecoration = !wasCompleted ? 'line-through' : 'none';

      // Update ring
      const newComps = DB.getCompletionsForDate(today);
      const allDue   = DB.getTasksDueOn(today);
      const newDone  = allDue.filter(t => newComps[t.id]).length;
      const newTotal = allDue.length;
      const newPct   = newTotal > 0 ? Math.round((newDone / newTotal) * 100) : 0;

      document.querySelector('.ring-pct').textContent = newPct + '%';
      document.querySelector('.big-done').innerHTML = `${newDone}<span>/${newTotal}</span>`;
      document.querySelector('.progress-sub').textContent =
        newDone === newTotal && newTotal > 0 ? '🎉 Perfect day!' :
        `${newTotal - newDone} task${newTotal - newDone !== 1 ? 's' : ''} remaining`;

      updateDoughnut(newDone, Math.max(newTotal, 1));
      if (!wasCompleted) showToast('✓ ' + DB.getTasks().find(t=>t.id===id)?.name + ' done!', 'success');
    });
  });

  document.getElementById('theme-toggle-today')?.addEventListener('click', toggleTheme);
}

function taskItemHTML(task, completed) {
  const catClass = `chip-${(task.category || 'Other').toLowerCase()}`;
  return `
    <div class="task-item ${completed ? 'completed' : ''}" data-id="${task.id}" id="task-${task.id}">
      <div class="task-checkbox">${completed ? '✓' : ''}</div>
      <div class="task-name">${escHtml(task.name)}</div>
      <div class="task-category-chip ${catClass}">${escHtml(task.category || 'Other')}</div>
    </div>
  `;
}

// ══════════════════════════════════════════════════════════════════════════════
// PAGE: PROGRESS
// ══════════════════════════════════════════════════════════════════════════════
function renderProgress(el) {
  const last30 = DB.getLast30Days();
  const streaks = DB.getStreaks();
  const weekly  = DB.getWeeklyStats();

  // 30-day data
  const chartLabels = last30.map(d => {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  const chartData = last30.map(d => {
    const s = DB.getDailyScore(d);
    return s ? s.pct : null;
  });

  // Stats
  const validScores = chartData.filter(v => v !== null);
  const avg30 = validScores.length ? Math.round(validScores.reduce((a,b) => a+b, 0) / validScores.length) : 0;
  const best  = validScores.length ? Math.max(...validScores) : 0;
  const worst = validScores.length ? Math.min(...validScores) : 0;

  // All-time totals
  const allComps = DB.getAllCompletions();
  let totalDone = 0, totalMissed = 0;
  for (const date in allComps) {
    const due = DB.getTasksDueOn(date);
    due.forEach(t => {
      if (allComps[date][t.id]) totalDone++;
      else totalMissed++;
    });
  }

  // Weekly breakdown
  const weekLabels = weekly.map(d => d.label);
  const weekData   = weekly.map(d => d.pct);

  // Weekly avg (last 7 days)
  const weekValid = weekData.filter(v => v !== null);
  const weekAvg   = weekValid.length ? Math.round(weekValid.reduce((a,b)=>a+b,0)/weekValid.length) : 0;

  // Calendar — current month
  const now = new Date();
  const calHTML = buildCalendar(now.getFullYear(), now.getMonth());

  el.innerHTML = `
    ${pageHeader('Progress', '', `<button class="icon-btn" id="theme-toggle-prog" title="Toggle theme">🌓</button>`)}

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value indigo">${avg30}%</div>
        <div class="stat-label">30-Day Avg</div>
      </div>
      <div class="stat-card">
        <div class="stat-value emerald">${weekAvg}%</div>
        <div class="stat-label">This Week</div>
      </div>
      <div class="stat-card">
        <div class="stat-value amber">${best}%</div>
        <div class="stat-label">Best Day</div>
      </div>
      <div class="stat-card">
        <div class="stat-value rose">${worst || '–'}%</div>
        <div class="stat-label">Worst Day</div>
      </div>
    </div>

    <div class="streak-row">
      <div class="streak-card">
        <div class="streak-icon">🔥</div>
        <div class="streak-info">
          <div class="value">${streaks.current}</div>
          <div class="label">Current Streak</div>
        </div>
      </div>
      <div class="streak-card">
        <div class="streak-icon">🏆</div>
        <div class="streak-info">
          <div class="value">${streaks.longest}</div>
          <div class="label">Longest Streak</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">30-Day Consistency</div>
      <div class="chart-wrap">
        <canvas id="consistency-canvas"></canvas>
      </div>
    </div>

    <div class="card">
      <div class="card-title">This Week</div>
      <div class="week-bar-list">
        ${weekly.map(d => {
          const pct = d.pct;
          const cls = pct === null ? 'empty' : pct >= 90 ? 'green' : pct >= 60 ? 'yellow' : 'red';
          const width = pct !== null ? pct : 0;
          return `
            <div class="week-bar-row">
              <div class="week-bar-day">${d.label}</div>
              <div class="week-bar-track">
                <div class="week-bar-fill ${cls}" style="width:${width}%"></div>
              </div>
              <div class="week-bar-val">${pct !== null ? pct + '%' : '–'}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <div class="card">
      <div class="card-title">All-Time</div>
      <div class="stats-grid" style="margin-bottom:0">
        <div class="stat-card">
          <div class="stat-value emerald">${totalDone}</div>
          <div class="stat-label">Completed</div>
        </div>
        <div class="stat-card">
          <div class="stat-value rose">${totalMissed}</div>
          <div class="stat-label">Missed</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">${now.toLocaleString('default', { month: 'long', year: 'numeric' })}</div>
      ${calHTML}
      <div style="display:flex;gap:12px;margin-top:12px;font-size:12px;color:var(--text-muted);">
        <span>🟢 ≥90%</span><span>🟡 60–89%</span><span>🔴 &lt;60%</span><span>⬛ No tasks</span>
      </div>
    </div>
  `;

  setTimeout(() => {
    renderConsistencyChart('consistency-canvas', chartLabels, chartData);
  }, 50);

  document.getElementById('theme-toggle-prog')?.addEventListener('click', toggleTheme);
}

function buildCalendar(year, month) {
  const today = todayStr();
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstDay; // Sun=0

  let html = '<div class="calendar-grid">';
  ['Su','Mo','Tu','We','Th','Fr','Sa'].forEach(d => {
    html += `<div class="cal-day-header">${d}</div>`;
  });

  for (let i = 0; i < startOffset; i++) {
    html += '<div class="cal-day empty"></div>';
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const m = String(month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    const dateStr = `${year}-${m}-${d}`;
    const isFuture = dateStr > today;
    const isToday = dateStr === today;

    let cls = 'cal-day';
    if (isToday) cls += ' today';
    if (isFuture) { cls += ' future'; html += `<div class="${cls}">${day}</div>`; continue; }

    const score = DB.getDailyScore(dateStr);
    if (score && score.total > 0) {
      if (score.pct >= 90) cls += ' green';
      else if (score.pct >= 60) cls += ' yellow';
      else cls += ' red';
    }

    html += `<div class="${cls}" title="${score ? score.pct + '%' : 'No tasks'}">${day}</div>`;
  }

  html += '</div>';
  return html;
}

// ══════════════════════════════════════════════════════════════════════════════
// PAGE: WEIGHT
// ══════════════════════════════════════════════════════════════════════════════
function renderWeight(el) {
  const settings = DB.getSettings();
  const entries  = DB.getWeightEntries();
  const unit     = settings.units || 'kg';
  const target   = parseFloat(settings.targetWeight) || 70;

  const startW   = settings.startWeight ? parseFloat(settings.startWeight) : (entries.length > 0 ? entries[0].weight : null);
  const currentW = entries.length > 0 ? entries[entries.length - 1].weight : null;
  const lost     = startW && currentW ? Math.max(0, startW - currentW) : 0;
  const remaining= currentW && target  ? Math.max(0, currentW - target) : 0;
  const totalToLose = startW && target ? Math.max(0, startW - target) : 0;
  const goalPct  = totalToLose > 0 ? Math.round((lost / totalToLose) * 100) : 0;

  const chartLabels = entries.map(e => {
    const d = new Date(e.date + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  const chartWeights = entries.map(e => e.weight);

  el.innerHTML = `
    ${pageHeader('Weight', '', `<button class="icon-btn" id="theme-toggle-weight" title="Toggle theme">🌓</button>`)}

    <div class="weight-stats">
      <div class="w-stat">
        <div class="w-stat-val">${startW ? startW + unit : '–'}</div>
        <div class="w-stat-lbl">Start</div>
      </div>
      <div class="w-stat">
        <div class="w-stat-val" style="color:var(--emerald)">${currentW ? currentW + unit : '–'}</div>
        <div class="w-stat-lbl">Current</div>
      </div>
      <div class="w-stat">
        <div class="w-stat-val" style="color:var(--rose)">${target}${unit}</div>
        <div class="w-stat-lbl">Target</div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Weight Progress</div>
      ${entries.length < 2 ? `
        <div class="empty-state" style="padding:20px">
          <span class="empty-icon" style="font-size:32px">📊</span>
          <p>Add at least 2 entries to see your chart.</p>
        </div>
      ` : `
        <div class="chart-wrap">
          <canvas id="weight-canvas"></canvas>
        </div>
      `}

      <div class="progress-bar-wrap">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-size:12px;color:var(--text-muted)">Goal Progress</span>
          <span style="font-size:14px;font-weight:700;color:var(--emerald)">${goalPct}%</span>
        </div>
        <div class="progress-bar-track">
          <div class="progress-bar-fill" style="width:${goalPct}%"></div>
        </div>
        <div class="progress-bar-labels">
          <span>${startW || '–'}${unit} start</span>
          <span>${target}${unit} target</span>
        </div>
      </div>

      <div class="divider"></div>

      <div class="weight-detail-row">
        <span class="lbl">Lost so far</span>
        <span class="val emerald">-${lost.toFixed(1)} ${unit}</span>
      </div>
      <div class="weight-detail-row">
        <span class="lbl">Still to lose</span>
        <span class="val">${remaining.toFixed(1)} ${unit}</span>
      </div>
      <div class="weight-detail-row">
        <span class="lbl">Entries logged</span>
        <span class="val indigo">${entries.length}</span>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Add Measurement</div>
      <div class="form-row" style="margin-bottom:12px">
        <div class="form-group">
          <label class="form-label" for="w-date">Date</label>
          <input class="form-input" type="date" id="w-date" value="${todayStr()}">
        </div>
        <div class="form-group">
          <label class="form-label" for="w-val">Weight (${unit})</label>
          <input class="form-input" type="number" id="w-val" step="0.1" min="30" max="300"
            placeholder="${currentW || 70}" value="${currentW || ''}">
        </div>
      </div>
      <button class="btn btn-primary btn-full" id="add-weight-btn">➕ Add Entry</button>
    </div>

    <div class="card" style="margin-bottom:0">
      <div class="card-title">Log (${entries.length} entries)</div>
      <div class="weight-log">
        ${entries.length === 0 ? '<p style="color:var(--text-muted);font-size:14px">No entries yet.</p>' :
          [...entries].reverse().slice(0, 15).map(e => `
            <div class="weight-log-item">
              <span class="weight-log-date">${formatDateDisplay(e.date)}</span>
              <span class="weight-log-val">${e.weight} ${unit}</span>
              <button class="weight-log-del" data-date="${e.date}" title="Delete">✕</button>
            </div>
          `).join('')
        }
      </div>
    </div>
  `;

  if (entries.length >= 2) {
    setTimeout(() => {
      renderWeightChart('weight-canvas', chartLabels, chartWeights, target);
    }, 50);
  }

  document.getElementById('add-weight-btn')?.addEventListener('click', () => {
    const dateVal = document.getElementById('w-date').value;
    const wVal    = parseFloat(document.getElementById('w-val').value);
    if (!dateVal || isNaN(wVal) || wVal < 20 || wVal > 400) {
      showToast('Please enter a valid date and weight.', 'error'); return;
    }
    DB.addWeightEntry(dateVal, wVal);
    showToast('✓ Weight entry saved!', 'success');
    navigate('weight');
  });

  el.querySelectorAll('.weight-log-del').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      DB.deleteWeightEntry(btn.dataset.date);
      showToast('Entry deleted.', '');
      navigate('weight');
    });
  });

  document.getElementById('theme-toggle-weight')?.addEventListener('click', toggleTheme);
}

// ══════════════════════════════════════════════════════════════════════════════
// PAGE: SETTINGS
// ══════════════════════════════════════════════════════════════════════════════
function renderSettings(el) {
  const tasks    = DB.getTasks();
  const settings = DB.getSettings();

  el.innerHTML = `
    ${pageHeader('Settings', '', `<button class="icon-btn" id="theme-toggle-sett" title="Toggle theme">🌓</button>`)}

    <div class="card settings-section">
      <div class="card-title">Tasks</div>
      <div id="task-list-mgmt">
        ${tasks.length === 0 ? `<div class="empty-state" style="padding:20px"><p>No tasks yet. Add your first one!</p></div>` :
          tasks.map(t => taskMgmtItemHTML(t)).join('')
        }
      </div>
      <button class="btn btn-primary btn-full" id="open-add-task" style="margin-top:12px">
        ➕ Add Task
      </button>
    </div>

    <div class="card settings-section">
      <div class="card-title">Weight Settings</div>
      <div class="form-group" style="margin-bottom:12px">
        <label class="form-label" for="sett-target">Target Weight (${settings.units || 'kg'})</label>
        <input class="form-input" type="number" id="sett-target" step="0.5" value="${settings.targetWeight || 70}">
      </div>
      <div class="form-group" style="margin-bottom:12px">
        <label class="form-label" for="sett-start">Starting Weight (${settings.units || 'kg'})</label>
        <input class="form-input" type="number" id="sett-start" step="0.5" value="${settings.startWeight || ''}">
      </div>
      <div class="form-group" style="margin-bottom:16px">
        <label class="form-label" for="sett-units">Units</label>
        <select class="form-select" id="sett-units">
          <option value="kg" ${settings.units === 'kg' ? 'selected' : ''}>Kilograms (kg)</option>
          <option value="lbs" ${settings.units === 'lbs' ? 'selected' : ''}>Pounds (lbs)</option>
        </select>
      </div>
      <button class="btn btn-primary btn-full" id="save-weight-settings">Save Settings</button>
    </div>

    <div class="card settings-section">
      <div class="card-title">Appearance</div>
      <div class="toggle-row">
        <div>
          <div class="toggle-label">Dark Mode</div>
          <div class="toggle-sub">Toggle between dark and light theme</div>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" id="theme-toggle-check" ${settings.theme !== 'light' ? 'checked' : ''}>
          <div class="toggle-track"></div>
        </label>
      </div>
    </div>

    <div class="card settings-section">
      <div class="card-title">Data</div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <button class="btn btn-secondary btn-full" id="export-btn">📤 Export Data (JSON)</button>
        <button class="btn btn-danger btn-full" id="reset-btn">⚠️ Reset All Data</button>
      </div>
    </div>
  `;

  // Bind events
  document.getElementById('open-add-task')?.addEventListener('click', () => openTaskModal(null));

  document.querySelectorAll('.task-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openTaskModal(btn.dataset.id));
  });

  document.querySelectorAll('.task-del-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm(`Delete "${DB.getTasks().find(t => t.id === btn.dataset.id)?.name}"?`)) {
        DB.deleteTask(btn.dataset.id);
        showToast('Task deleted.', '');
        navigate('settings');
      }
    });
  });

  document.getElementById('save-weight-settings')?.addEventListener('click', () => {
    const target = parseFloat(document.getElementById('sett-target').value);
    const start  = parseFloat(document.getElementById('sett-start').value);
    const units  = document.getElementById('sett-units').value;
    DB.saveSettings({ targetWeight: isNaN(target) ? 70 : target, startWeight: isNaN(start) ? null : start, units });
    showToast('✓ Settings saved!', 'success');
  });

  document.getElementById('theme-toggle-check')?.addEventListener('change', e => {
    setTheme(e.target.checked ? 'dark' : 'light');
  });

  document.getElementById('theme-toggle-sett')?.addEventListener('click', toggleTheme);

  document.getElementById('export-btn')?.addEventListener('click', exportData);

  document.getElementById('reset-btn')?.addEventListener('click', () => {
    if (confirm('This will delete ALL your data. Are you sure?')) {
      localStorage.clear();
      DB.seedDemoData();
      showToast('Data reset to demo.', '');
      navigate('today');
    }
  });
}

function taskMgmtItemHTML(task) {
  const freqDisplay = Array.isArray(task.frequency)
    ? task.frequency.map(d => d[0].toUpperCase() + d.slice(1)).join(', ')
    : (task.frequency || 'daily').charAt(0).toUpperCase() + (task.frequency || 'daily').slice(1);

  return `
    <div class="task-mgmt-item">
      <div class="task-mgmt-info">
        <div class="task-mgmt-name">${escHtml(task.name)}</div>
        <div class="task-mgmt-sub">${escHtml(task.category || 'Other')} · ${task.group || 'Other'} · <span class="freq-pill">${freqDisplay}</span></div>
      </div>
      <div class="task-mgmt-actions">
        <button class="action-btn edit-btn task-edit-btn" data-id="${task.id}" title="Edit">✏️</button>
        <button class="action-btn del-btn task-del-btn" data-id="${task.id}" title="Delete">🗑️</button>
      </div>
    </div>
  `;
}

// ── Task Modal (Add / Edit) ────────────────────────────────────────────────────
function openTaskModal(taskId) {
  State.editingTaskId = taskId;
  const task = taskId ? DB.getTasks().find(t => t.id === taskId) : null;
  const isEdit = !!task;

  const freqDays = Array.isArray(task?.frequency) ? task.frequency : [];
  const days = ['mon','tue','wed','thu','fri','sat','sun'];
  const dayLabels = ['Mo','Tu','We','Th','Fr','Sa','Su'];

  const modal = document.getElementById('task-modal');
  const overlay = document.getElementById('task-modal-overlay');

  modal.innerHTML = `
    <div class="modal-handle"></div>
    <div class="modal-title">${isEdit ? 'Edit Task' : 'Add Task'}</div>

    <div class="form-group" style="margin-bottom:14px">
      <label class="form-label" for="task-name-input">Task Name</label>
      <input class="form-input" type="text" id="task-name-input" placeholder="e.g. Morning Run" value="${escHtml(task?.name || '')}">
    </div>

    <div class="form-row" style="margin-bottom:14px">
      <div class="form-group">
        <label class="form-label" for="task-category-input">Category</label>
        <select class="form-select" id="task-category-input">
          ${['Fitness','Learning','Career','Health','Other'].map(c =>
            `<option value="${c}" ${task?.category === c ? 'selected' : ''}>${c}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label" for="task-group-input">Time of Day</label>
        <select class="form-select" id="task-group-input">
          ${['Morning','Afternoon','Evening','Night','Other'].map(g =>
            `<option value="${g}" ${task?.group === g ? 'selected' : ''}>${g}</option>`
          ).join('')}
        </select>
      </div>
    </div>

    <div class="form-group" style="margin-bottom:14px">
      <label class="form-label">Frequency</label>
      <select class="form-select" id="task-freq-type" style="margin-bottom:10px">
        <option value="daily"  ${task?.frequency === 'daily'  ? 'selected' : ''}>Daily</option>
        <option value="weekly" ${task?.frequency === 'weekly' ? 'selected' : ''}>Weekly (Sunday)</option>
        <option value="custom" ${Array.isArray(task?.frequency) ? 'selected' : ''}>Custom Days</option>
      </select>
      <div class="freq-days" id="freq-days-wrap" style="${Array.isArray(task?.frequency) ? '' : 'display:none'}">
        ${days.map((d, i) => `
          <input type="checkbox" class="freq-day" id="fd-${d}" value="${d}" ${freqDays.includes(d) ? 'checked' : ''}>
          <label for="fd-${d}">${dayLabels[i]}</label>
        `).join('')}
      </div>
    </div>

    <div style="display:flex;gap:10px;margin-top:8px">
      <button class="btn btn-secondary" style="flex:1" id="task-cancel-btn">Cancel</button>
      <button class="btn btn-primary" style="flex:2" id="task-save-btn">${isEdit ? 'Save Changes' : 'Add Task'}</button>
    </div>
  `;

  overlay.classList.add('open');

  document.getElementById('task-freq-type').addEventListener('change', e => {
    document.getElementById('freq-days-wrap').style.display = e.target.value === 'custom' ? 'flex' : 'none';
  });

  document.getElementById('task-cancel-btn').addEventListener('click', closeTaskModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeTaskModal(); });

  document.getElementById('task-save-btn').addEventListener('click', () => {
    const name = document.getElementById('task-name-input').value.trim();
    if (!name) { showToast('Please enter a task name.', 'error'); return; }

    const category = document.getElementById('task-category-input').value;
    const group    = document.getElementById('task-group-input').value;
    const freqType = document.getElementById('task-freq-type').value;
    let frequency;
    if (freqType === 'custom') {
      frequency = [...document.querySelectorAll('.freq-day:checked')].map(cb => cb.value);
      if (frequency.length === 0) { showToast('Select at least one day.', 'error'); return; }
    } else {
      frequency = freqType;
    }

    if (isEdit) {
      DB.updateTask(taskId, { name, category, group, frequency });
      showToast('✓ Task updated!', 'success');
    } else {
      DB.addTask({ name, category, group, frequency });
      showToast('✓ Task added!', 'success');
    }

    closeTaskModal();
    navigate('settings');
  });
}

function closeTaskModal() {
  document.getElementById('task-modal-overlay').classList.remove('open');
}

// ══════════════════════════════════════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════════════════════════════════════
function pageHeader(title, leftContent, rightContent = '') {
  return `
    <div class="page-header">
      <div>
        <h1>${title}</h1>
        ${leftContent || ''}
      </div>
      <div class="header-right">${rightContent || ''}</div>
    </div>
  `;
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg, type = '') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function toggleTheme() {
  const s = DB.getSettings();
  setTheme(s.theme === 'dark' ? 'light' : 'dark');
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  DB.saveSettings({ theme });
}

function exportData() {
  const data = {
    tasks: DB.getTasks(),
    completions: DB.getAllCompletions(),
    weight: DB.getWeightEntries(),
    settings: DB.getSettings(),
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `lifetrack-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✓ Data exported!', 'success');
}

// ══════════════════════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════════════════════
function init() {
  // Check version — wipes stale data (e.g. duplicate IDs) and re-seeds if needed
  DB.checkVersion();

  // Apply saved theme
  const settings = DB.getSettings();
  setTheme(settings.theme || 'dark');

  // Navigation
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.page));
  });

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }

  // Render first page
  navigate('today');
}

document.addEventListener('DOMContentLoaded', init);
