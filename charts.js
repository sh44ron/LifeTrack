// LifeTrack Charts Layer — Chart.js wrappers

let doughnutChart = null;
let consistencyChart = null;
let weeklyChart = null;
let weightChart = null;

// ── Color palette ──────────────────────────────────────────────────────────────
const COLORS = {
  indigo: '#6366f1',
  indigoLight: '#818cf8',
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#f43f5e',
  slate: '#1e2a3a',
  slateLight: '#2d3f55',
  text: '#e2e8f0',
  textMuted: '#64748b',
  grid: 'rgba(99,102,241,0.1)',
};

// ── Shared Chart.js defaults ───────────────────────────────────────────────────
function applyDefaults() {
  Chart.defaults.color = COLORS.textMuted;
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.font.size = 12;
}

// ── Doughnut — Today's Progress ───────────────────────────────────────────────
function renderDoughnut(canvasId, done, total) {
  applyDefaults();
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const remaining = total - done;

  if (doughnutChart) {
    doughnutChart.data.datasets[0].data = [done, remaining];
    doughnutChart.update('active');
    return;
  }

  doughnutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [done, remaining],
        backgroundColor: [COLORS.indigo, COLORS.slate],
        borderColor: ['transparent', 'transparent'],
        borderWidth: 0,
        hoverBackgroundColor: [COLORS.indigoLight, COLORS.slateLight],
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '78%',
      animation: { animateRotate: true, duration: 600, easing: 'easeInOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
      },
    },
  });
}

function updateDoughnut(done, total) {
  if (!doughnutChart) return;
  const remaining = Math.max(0, total - done);
  doughnutChart.data.datasets[0].data = [done, remaining];
  doughnutChart.update('active');
}

// ── Line Chart — 30-day Consistency ───────────────────────────────────────────
function renderConsistencyChart(canvasId, labels, data) {
  applyDefaults();
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  if (consistencyChart) {
    consistencyChart.data.labels = labels;
    consistencyChart.data.datasets[0].data = data;
    consistencyChart.update();
    return;
  }

  const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 200);
  gradient.addColorStop(0, 'rgba(99,102,241,0.35)');
  gradient.addColorStop(1, 'rgba(99,102,241,0)');

  consistencyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Consistency %',
        data,
        borderColor: COLORS.indigo,
        backgroundColor: gradient,
        borderWidth: 2.5,
        pointBackgroundColor: COLORS.indigo,
        pointBorderColor: '#0d1117',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.4,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e2a3a',
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          borderColor: '#6366f1',
          borderWidth: 1,
          padding: 10,
          callbacks: { label: ctx => ` ${ctx.parsed.y ?? 0}%` },
        },
      },
      scales: {
        x: {
          grid: { color: COLORS.grid },
          ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 10 },
        },
        y: {
          min: 0, max: 100,
          grid: { color: COLORS.grid },
          ticks: { callback: v => v + '%' },
        },
      },
    },
  });
}

// ── Bar Chart — Weekly breakdown ───────────────────────────────────────────────
function renderWeeklyChart(canvasId, labels, data) {
  applyDefaults();
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const bgColors = data.map(v => {
    if (v === null) return 'rgba(45,63,85,0.5)';
    if (v >= 90) return COLORS.emerald;
    if (v >= 60) return COLORS.amber;
    return COLORS.rose;
  });

  if (weeklyChart) {
    weeklyChart.data.labels = labels;
    weeklyChart.data.datasets[0].data = data;
    weeklyChart.data.datasets[0].backgroundColor = bgColors;
    weeklyChart.update();
    return;
  }

  weeklyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '%',
        data,
        backgroundColor: bgColors,
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e2a3a',
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          borderColor: COLORS.slateLight,
          borderWidth: 1,
          callbacks: { label: ctx => ` ${ctx.parsed.y ?? '–'}%` },
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          min: 0, max: 100,
          grid: { color: COLORS.grid },
          ticks: { callback: v => v + '%' },
        },
      },
    },
  });
}

// ── Line Chart — Weight Progress ───────────────────────────────────────────────
function renderWeightChart(canvasId, labels, weights, targetWeight) {
  applyDefaults();
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;

  const targetLine = labels.map(() => targetWeight);

  const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 220);
  gradient.addColorStop(0, 'rgba(16,185,129,0.3)');
  gradient.addColorStop(1, 'rgba(16,185,129,0)');

  if (weightChart) {
    weightChart.data.labels = labels;
    weightChart.data.datasets[0].data = weights;
    weightChart.data.datasets[1].data = targetLine;
    weightChart.update();
    return;
  }

  weightChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Weight',
          data: weights,
          borderColor: COLORS.emerald,
          backgroundColor: gradient,
          borderWidth: 2.5,
          pointBackgroundColor: COLORS.emerald,
          pointBorderColor: '#0d1117',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7,
          tension: 0.4,
          fill: true,
        },
        {
          label: 'Target',
          data: targetLine,
          borderColor: COLORS.rose,
          borderWidth: 1.5,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          labels: { usePointStyle: true, pointStyle: 'circle', color: COLORS.text },
        },
        tooltip: {
          backgroundColor: '#1e2a3a',
          titleColor: '#e2e8f0',
          bodyColor: '#94a3b8',
          borderColor: COLORS.emerald,
          borderWidth: 1,
          padding: 10,
          callbacks: { label: ctx => ` ${ctx.parsed.y} kg` },
        },
      },
      scales: {
        x: {
          grid: { color: COLORS.grid },
          ticks: { maxRotation: 45, autoSkip: true, maxTicksLimit: 8 },
        },
        y: {
          grid: { color: COLORS.grid },
          ticks: { callback: v => v + ' kg' },
        },
      },
    },
  });
}

// ── Destroy all charts (for theme switch / page nav) ──────────────────────────
function destroyAllCharts() {
  [doughnutChart, consistencyChart, weeklyChart, weightChart].forEach(c => {
    if (c) c.destroy();
  });
  doughnutChart = consistencyChart = weeklyChart = weightChart = null;
}
