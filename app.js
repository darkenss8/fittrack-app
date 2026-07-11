(function () {
  'use strict';

  const STORAGE_KEY = 'fittrack_data_v1';

  const EXERCISE_LIBRARY = [
    'Barbell bench press', 'Incline bench press', 'Dumbbell bench press', 'Incline dumbbell press',
    'Push-up', 'Dumbbell fly', 'Cable fly', 'Chest dip', 'Pec deck',
    'Pull-up', 'Chin-up', 'Lat pulldown', 'Barbell row', 'Dumbbell row',
    'Seated cable row', 'T-bar row', 'Deadlift', 'Romanian deadlift', 'Face pull',
    'Overhead press', 'Dumbbell shoulder press', 'Arnold press', 'Lateral raise',
    'Front raise', 'Rear delt fly', 'Shrug', 'Upright row',
    'Barbell curl', 'Dumbbell curl', 'Hammer curl', 'Preacher curl', 'Cable curl',
    'Triceps pushdown', 'Overhead triceps extension', 'Skull crusher', 'Close-grip bench press', 'Dip',
    'Squat', 'Front squat', 'Leg press', 'Lunge', 'Bulgarian split squat',
    'Leg extension', 'Leg curl', 'Hip thrust', 'Calf raise', 'Glute bridge',
    'Plank', 'Side plank', 'Crunch', 'Sit-up', 'Hanging leg raise',
    'Russian twist', 'Cable woodchopper', 'Mountain climber', 'Ab wheel rollout',
    'Running', 'Cycling', 'Rowing machine', 'Elliptical', 'Stair climber',
    'Jump rope', 'Swimming', 'Walking', 'Hiking', 'Burpee'
  ];

  // ---------- helpers ----------
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function localDateStr(d) {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function todayStr() { return localDateStr(new Date()); }

  function shiftDate(dateStr, delta) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + delta);
    return localDateStr(dt);
  }

  function fmtDateLabel(dateStr) {
    const t = todayStr();
    if (dateStr === t) return 'Today';
    if (dateStr === shiftDate(t, -1)) return 'Yesterday';
    if (dateStr === shiftDate(t, 1)) return 'Tomorrow';
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function fmtDateSub(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function round(n, dp = 0) {
    const f = Math.pow(10, dp);
    return Math.round((Number(n) || 0) * f) / f;
  }

  // ---------- data ----------
  const defaultData = {
    meals: [],
    workouts: [],
    weights: [],
    settings: {
      calorieGoal: 2200, proteinGoal: 150, carbGoal: 220, fatGoal: 70, unit: 'kg', targetWeight: null,
      anthropicApiKey: '', aiModel: 'claude-opus-4-8'
    }
  };

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return JSON.parse(JSON.stringify(defaultData));
      const parsed = JSON.parse(raw);
      return {
        meals: parsed.meals || [],
        workouts: parsed.workouts || [],
        weights: parsed.weights || [],
        settings: Object.assign({}, defaultData.settings, parsed.settings || {})
      };
    } catch (e) {
      console.error('Failed to load data', e);
      return JSON.parse(JSON.stringify(defaultData));
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  }

  const state = {
    data: load(),
    tab: 'dashboard',
    date: { dashboard: todayStr(), meals: todayStr(), workouts: todayStr() }
  };

  // ---------- derived ----------
  function mealsForDate(d) {
    return state.data.meals.filter(m => m.date === d).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  }
  function workoutsForDate(d) {
    return state.data.workouts.filter(w => w.date === d);
  }
  function totalsForDate(d) {
    return mealsForDate(d).reduce((acc, m) => {
      acc.calories += Number(m.calories) || 0;
      acc.protein += Number(m.protein) || 0;
      acc.carbs += Number(m.carbs) || 0;
      acc.fat += Number(m.fat) || 0;
      return acc;
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
  }
  function sortedWeights() {
    return [...state.data.weights].sort((a, b) => a.date.localeCompare(b.date));
  }
  function latestWeight() {
    const w = sortedWeights();
    return w.length ? w[w.length - 1] : null;
  }

  // ---------- render dispatch ----------
  const viewEl = document.getElementById('view');

  function render() {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === state.tab));
    if (state.tab === 'dashboard') viewEl.innerHTML = renderDashboard();
    else if (state.tab === 'meals') viewEl.innerHTML = renderMeals();
    else if (state.tab === 'workouts') viewEl.innerHTML = renderWorkouts();
    else if (state.tab === 'weight') viewEl.innerHTML = renderWeightView();
    else if (state.tab === 'settings') viewEl.innerHTML = renderSettings();

    if (state.tab === 'weight') drawWeightChart();
  }

  function dateNav(scope) {
    const d = state.date[scope];
    return `
      <div class="date-nav">
        <button data-action="date-prev" data-scope="${scope}">&#8249;</button>
        <div>
          <div class="date-label" style="text-align:center">${fmtDateLabel(d)}</div>
          <span class="date-sub">${fmtDateSub(d)}</span>
        </div>
        <button data-action="date-next" data-scope="${scope}" ${d === todayStr() ? '' : ''}>&#8250;</button>
      </div>`;
  }

  // ---------- Dashboard ----------
  function renderDashboard() {
    const d = state.date.dashboard;
    const g = state.data.settings;
    const t = totalsForDate(d);
    const pct = g.calorieGoal ? Math.min(100, round((t.calories / g.calorieGoal) * 100)) : 0;
    const remaining = round(g.calorieGoal - t.calories);
    const w = workoutsForDate(d);
    const lw = latestWeight();

    return `
      ${dateNav('dashboard')}
      <div class="card">
        <h2>Calories</h2>
        <div class="stat-row">
          <div class="ring-wrap" style="background: conic-gradient(var(--accent) ${pct}%, var(--surface-2) 0)">
            <div class="ring-hole"></div>
            <div class="ring-center">
              <div class="num">${round(t.calories)}</div>
              <div class="label">of ${g.calorieGoal} kcal</div>
            </div>
          </div>
          <div class="stat-mini-list">
            <div class="stat-mini"><span>Remaining</span><span class="v">${remaining >= 0 ? remaining : 0} kcal</span></div>
            <div class="stat-mini"><span>Meals logged</span><span class="v">${mealsForDate(d).length}</span></div>
            <div class="stat-mini"><span>Workouts</span><span class="v">${w.length}</span></div>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>Macros</h2>
        ${macroBar('Protein', t.protein, g.proteinGoal, 'var(--accent)')}
        ${macroBar('Carbs', t.carbs, g.carbGoal, 'var(--orange)')}
        ${macroBar('Fat', t.fat, g.fatGoal, 'var(--purple)')}
      </div>

      <div class="card">
        <h2>Today's workouts</h2>
        ${w.length ? w.map(workoutListItem).join('') : `<div class="empty-state">No workouts logged for this day.</div>`}
      </div>

      <div class="card">
        <h2>Weight</h2>
        ${lw ? `<div class="stat-mini"><span>Latest (${fmtDateLabel(lw.date)})</span><span class="v">${lw.weight} ${g.unit}</span></div>` : `<div class="empty-state">No weight entries yet.</div>`}
      </div>
    `;
  }

  function macroBar(label, val, goal, color) {
    const pct = goal ? Math.min(100, round((val / goal) * 100)) : 0;
    return `
      <div class="macro">
        <div class="macro-row"><span>${label}</span><span><b>${round(val)}g</b> / ${goal}g</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%; background:${color}"></div></div>
      </div>`;
  }

  // ---------- Meals ----------
  function renderMeals() {
    const d = state.date.meals;
    const meals = mealsForDate(d);
    const t = totalsForDate(d);
    return `
      ${dateNav('meals')}
      <div class="card">
        <div class="stat-mini"><span>Total calories</span><span class="v">${round(t.calories)} kcal</span></div>
      </div>
      <div class="card">
        <h2>Meals</h2>
        ${meals.length ? meals.map(mealListItem).join('') : `<div class="empty-state">No meals logged for this day.</div>`}
      </div>
      <button class="fab" data-action="open-add-meal">+</button>
    `;
  }

  function mealListItem(m) {
    return `
      <div class="list-item">
        <div class="li-main">
          <div class="li-title">${esc(m.name)}</div>
          <div class="li-sub">${m.time ? esc(m.time) + ' &middot; ' : ''}P ${round(m.protein)}g &middot; C ${round(m.carbs)}g &middot; F ${round(m.fat)}g</div>
        </div>
        <div class="li-value">${round(m.calories)} kcal</div>
        <button class="li-del" data-action="delete-meal" data-id="${m.id}">&#10005;</button>
      </div>`;
  }

  // ---------- Workouts ----------
  function renderWorkouts() {
    const d = state.date.workouts;
    const workouts = workoutsForDate(d);
    return `
      ${dateNav('workouts')}
      <button type="button" class="btn secondary" data-action="open-generate-workout" style="margin-bottom:14px">&#10024; Generate a workout with AI</button>
      <div class="card">
        <h2>Workouts</h2>
        ${workouts.length ? workouts.map(workoutListItem).join('') : `<div class="empty-state">No workouts logged for this day.</div>`}
      </div>
      <button class="fab" data-action="open-add-workout">+</button>
    `;
  }

  function workoutListItem(w) {
    let sub;
    if (w.type === 'cardio' && w.cardio) {
      const parts = [];
      if (w.cardio.duration) parts.push(`${w.cardio.duration} min`);
      if (w.cardio.distance) parts.push(`${w.cardio.distance} km`);
      sub = parts.join(' &middot; ') || 'Cardio';
    } else {
      const n = (w.exercises || []).length;
      sub = n ? `${n} exercise${n === 1 ? '' : 's'}` : 'Strength';
    }
    return `
      <div class="list-item">
        <div class="li-main">
          <div class="li-title">${esc(w.name || (w.type === 'cardio' ? 'Cardio' : 'Strength'))}</div>
          <div class="li-sub">${sub}</div>
        </div>
        <button class="li-del" data-action="delete-workout" data-id="${w.id}">&#10005;</button>
      </div>`;
  }

  // ---------- Weight ----------
  function renderWeightView() {
    const entries = [...sortedWeights()].reverse();
    const unit = state.data.settings.unit;
    return `
      <div class="card">
        <h2>Trend</h2>
        <div class="chart-wrap"><canvas id="weight-canvas"></canvas></div>
      </div>
      <div class="card">
        <h2>History</h2>
        ${entries.length ? entries.map((w, i) => weightListItem(w, entries[i + 1])).join('') : `<div class="empty-state">No weight entries yet.</div>`}
      </div>
      <button class="fab" data-action="open-add-weight">+</button>
    `;
  }

  function weightListItem(w, prev) {
    const unit = state.data.settings.unit;
    let deltaHtml = '';
    if (prev) {
      const delta = round(w.weight - prev.weight, 1);
      if (delta !== 0) {
        const cls = delta < 0 ? 'down' : 'up';
        deltaHtml = `<span class="weight-delta ${cls}">${delta > 0 ? '+' : ''}${delta} ${unit}</span>`;
      }
    }
    return `
      <div class="list-item">
        <div class="li-main">
          <div class="li-title">${fmtDateLabel(w.date)}</div>
          <div class="li-sub">${fmtDateSub(w.date)} ${deltaHtml}</div>
        </div>
        <div class="li-value">${w.weight} ${unit}</div>
        <button class="li-del" data-action="delete-weight" data-id="${w.id}">&#10005;</button>
      </div>`;
  }

  function drawWeightChart() {
    const canvas = document.getElementById('weight-canvas');
    if (!canvas) return;
    const wrap = canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const cw = wrap.clientWidth, ch = wrap.clientHeight;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cw, ch);

    const entries = sortedWeights().slice(-30);
    if (entries.length < 2) {
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-dim');
      ctx.font = '13px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(entries.length ? 'Log one more entry to see a trend' : 'No data yet', cw / 2, ch / 2);
      return;
    }

    const pad = 10;
    const values = entries.map(e => Number(e.weight));
    const min = Math.min(...values), max = Math.max(...values);
    const range = max - min || 1;

    const pts = entries.map((e, i) => {
      const x = pad + (i / (entries.length - 1)) * (cw - pad * 2);
      const y = pad + (1 - (Number(e.weight) - min) / range) * (ch - pad * 2);
      return [x, y];
    });

    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();

    // fill
    const grad = ctx.createLinearGradient(0, 0, 0, ch);
    grad.addColorStop(0, accent + '33');
    grad.addColorStop(1, accent + '00');
    ctx.beginPath();
    ctx.moveTo(pts[0][0], ch - pad);
    pts.forEach(p => ctx.lineTo(p[0], p[1]));
    ctx.lineTo(pts[pts.length - 1][0], ch - pad);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // line
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]));
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // dots
    ctx.fillStyle = accent;
    pts.forEach(p => {
      ctx.beginPath();
      ctx.arc(p[0], p[1], 3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // ---------- Settings ----------
  function renderSettings() {
    const s = state.data.settings;
    return `
      <div class="card">
        <h2>Daily goals</h2>
        <form id="settings-form">
          <div class="field">
            <label>Calorie goal (kcal)</label>
            <input type="number" name="calorieGoal" value="${s.calorieGoal}" min="0" required>
          </div>
          <div class="field-row">
            <div class="field">
              <label>Protein (g)</label>
              <input type="number" name="proteinGoal" value="${s.proteinGoal}" min="0" required>
            </div>
            <div class="field">
              <label>Carbs (g)</label>
              <input type="number" name="carbGoal" value="${s.carbGoal}" min="0" required>
            </div>
            <div class="field">
              <label>Fat (g)</label>
              <input type="number" name="fatGoal" value="${s.fatGoal}" min="0" required>
            </div>
          </div>
          <div class="field">
            <label>Weight unit</label>
            <div class="chip-row">
              <button type="button" class="chip ${s.unit === 'kg' ? 'active' : ''}" data-action="set-unit" data-unit="kg">kg</button>
              <button type="button" class="chip ${s.unit === 'lb' ? 'active' : ''}" data-action="set-unit" data-unit="lb">lb</button>
            </div>
          </div>
          <div class="field">
            <label>Target weight (${s.unit}, optional)</label>
            <input type="number" name="targetWeight" value="${s.targetWeight != null ? s.targetWeight : ''}" min="0" step="0.1">
          </div>
          <button type="submit" class="btn">Save goals</button>
        </form>
      </div>
      <div class="card">
        <h2>AI meal photo analysis</h2>
        <p class="help-text">Add your own Anthropic API key to enable "scan a meal photo" in the Add Meal screen. Get a key at <span class="mono">console.anthropic.com</span>. The key is stored only in this browser's local storage and is sent directly from your device to Anthropic for each photo &mdash; never to any other server.</p>
        <form id="ai-settings-form">
          <div class="field">
            <label>Anthropic API key</label>
            <input type="password" name="anthropicApiKey" value="${esc(s.anthropicApiKey || '')}" placeholder="sk-ant-..." autocapitalize="off" autocorrect="off" spellcheck="false">
          </div>
          <div class="field">
            <label>Model</label>
            <input type="text" name="aiModel" value="${esc(s.aiModel || 'claude-opus-4-8')}" autocapitalize="off" autocorrect="off" spellcheck="false">
          </div>
          <button type="submit" class="btn secondary">Save API settings</button>
        </form>
      </div>

      <div class="card">
        <h2>Data</h2>
        <button class="btn danger" data-action="clear-data">Clear all data</button>
      </div>
    `;
  }

  // ---------- Sheets (modals) ----------
  const modalRoot = document.getElementById('modal-root');

  function closeSheet() {
    stopBarcodeScanner();
    modalRoot.innerHTML = '';
  }

  function openSheet(html) {
    modalRoot.innerHTML = `
      <div class="sheet-backdrop" data-action="backdrop-close">
        <div class="sheet" data-sheet>
          <div class="sheet-handle"></div>
          ${html}
        </div>
      </div>`;
  }

  function openAddMealSheet() {
    openSheet(`
      <div class="sheet-header"><h2>Add meal</h2><button class="sheet-close" data-action="backdrop-close">&#10005;</button></div>
      <input type="file" id="meal-photo-input" accept="image/*" capture="environment" style="display:none">
      <button type="button" class="photo-btn" data-action="pick-meal-photo">&#128247; Scan meal photo (AI estimate)</button>
      <button type="button" class="photo-btn" data-action="scan-barcode">&#9974; Scan a barcode (packaged food)</button>
      <div id="barcode-area"></div>
      <div id="meal-photo-area"></div>
      <form id="meal-form">
        <div class="field">
          <label>Meal name</label>
          <input type="text" name="name" placeholder="e.g. Chicken salad" required autofocus>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Calories</label>
            <input type="number" name="calories" min="0" required>
          </div>
          <div class="field">
            <label>Time</label>
            <input type="time" name="time" value="${new Date().toTimeString().slice(0,5)}">
          </div>
        </div>
        <div class="field-row">
          <div class="field">
            <label>Protein (g)</label>
            <input type="number" name="protein" min="0" value="0">
          </div>
          <div class="field">
            <label>Carbs (g)</label>
            <input type="number" name="carbs" min="0" value="0">
          </div>
          <div class="field">
            <label>Fat (g)</label>
            <input type="number" name="fat" min="0" value="0">
          </div>
        </div>
        <button type="submit" class="btn">Add meal</button>
      </form>
    `);
  }

  function openAddWorkoutSheet() {
    openSheet(`
      <div class="sheet-header"><h2>Add workout</h2><button class="sheet-close" data-action="backdrop-close">&#10005;</button></div>
      <form id="workout-form">
        <div class="field">
          <label>Type</label>
          <div class="chip-row">
            <button type="button" class="chip active" data-action="set-workout-type" data-type="strength">Strength</button>
            <button type="button" class="chip" data-action="set-workout-type" data-type="cardio">Cardio</button>
          </div>
        </div>
        <input type="hidden" name="type" value="strength">
        <div class="field">
          <label>Name</label>
          <input type="text" name="name" placeholder="e.g. Push day / Morning run">
        </div>
        <div id="workout-type-fields"></div>
        <button type="submit" class="btn">Add workout</button>
      </form>
    `);
    renderWorkoutTypeFields('strength');
  }

  function renderWorkoutTypeFields(type) {
    const container = document.getElementById('workout-type-fields');
    if (!container) return;
    if (type === 'cardio') {
      container.innerHTML = `
        <div class="field-row">
          <div class="field">
            <label>Duration (min)</label>
            <input type="number" name="duration" min="0">
          </div>
          <div class="field">
            <label>Distance (km)</label>
            <input type="number" name="distance" min="0" step="0.1">
          </div>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div id="exercise-rows"></div>
        <button type="button" class="add-exercise-btn" data-action="add-exercise-row">+ Add exercise</button>
      `;
      addExerciseRow();
    }
  }

  function addExerciseRow(prefill) {
    const rows = document.getElementById('exercise-rows');
    if (!rows) return;
    const row = document.createElement('div');
    row.className = 'exercise-row';
    row.innerHTML = `
      <button type="button" class="li-del" data-action="remove-exercise-row">&#10005;</button>
      <div class="field">
        <label>Exercise</label>
        <input type="text" class="ex-name" placeholder="e.g. Bench press" list="exercise-library">
      </div>
      <div class="field-row">
        <div class="field"><label>Sets</label><input type="number" class="ex-sets" min="0"></div>
        <div class="field"><label>Reps</label><input type="number" class="ex-reps" min="0"></div>
        <div class="field"><label>Weight</label><input type="number" class="ex-weight" min="0" step="0.5"></div>
      </div>
    `;
    if (prefill) {
      if (prefill.name != null) row.querySelector('.ex-name').value = prefill.name;
      if (prefill.sets != null) row.querySelector('.ex-sets').value = prefill.sets;
      if (prefill.reps != null) row.querySelector('.ex-reps').value = prefill.reps;
      if (prefill.weight != null) row.querySelector('.ex-weight').value = prefill.weight;
    }
    rows.appendChild(row);
  }

  // ---------- AI workout generator ----------
  const FOCUS_OPTIONS = ['Full body', 'Upper body', 'Lower body', 'Push', 'Pull', 'Legs', 'Core', 'Cardio'];
  const EQUIPMENT_OPTIONS = ['Bodyweight', 'Dumbbells', 'Barbell', 'Machines', 'Bands', 'Full gym'];
  const LEVEL_OPTIONS = ['Beginner', 'Intermediate', 'Advanced'];
  let genPrefs = { focus: FOCUS_OPTIONS[0], equipment: new Set(), level: 'Intermediate' };

  function openGenerateWorkoutSheet() {
    const s = state.data.settings;
    if (!s.anthropicApiKey) {
      alert('Add your Anthropic API key in Settings first to generate a workout.');
      return;
    }
    genPrefs = { focus: FOCUS_OPTIONS[0], equipment: new Set(), level: 'Intermediate' };
    openSheet(`
      <div class="sheet-header"><h2>Generate workout</h2><button class="sheet-close" data-action="backdrop-close">&#10005;</button></div>
      <div id="generate-workout-area">
        <div class="field">
          <label>Focus</label>
          <div class="chip-row">
            ${FOCUS_OPTIONS.map((f, i) => `<button type="button" class="chip${i === 0 ? ' active' : ''}" data-action="set-focus" data-focus="${esc(f)}">${esc(f)}</button>`).join('')}
          </div>
        </div>
        <div class="field">
          <label>Equipment available (optional &mdash; leave blank for bodyweight)</label>
          <div class="chip-row">
            ${EQUIPMENT_OPTIONS.map(eq => `<button type="button" class="chip" data-action="toggle-equipment" data-equipment="${esc(eq)}">${esc(eq)}</button>`).join('')}
          </div>
        </div>
        <div class="field">
          <label>Level</label>
          <div class="chip-row">
            ${LEVEL_OPTIONS.map((l, i) => `<button type="button" class="chip${i === 1 ? ' active' : ''}" data-action="set-level" data-level="${esc(l)}">${esc(l)}</button>`).join('')}
          </div>
        </div>
        <div class="field">
          <label>Duration (minutes)</label>
          <input type="number" id="gw-duration" value="45" min="10" max="180" step="5">
        </div>
        <div class="field">
          <label>Anything else? (optional)</label>
          <input type="text" id="gw-notes" placeholder="e.g. bad knee, avoid overhead pressing">
        </div>
        <button type="button" class="btn" data-action="generate-workout">Generate workout</button>
      </div>
    `);
  }

  async function runGenerateWorkout() {
    const area = document.getElementById('generate-workout-area');
    const btn = document.querySelector('[data-action="generate-workout"]');
    const existingError = document.getElementById('gw-error');
    if (existingError) existingError.remove();
    const duration = Number(document.getElementById('gw-duration').value) || 45;
    const notes = (document.getElementById('gw-notes').value || '').trim();
    if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }

    try {
      const plan = await generateWorkoutPlan(genPrefs.focus, Array.from(genPrefs.equipment), genPrefs.level, duration, notes);
      renderGeneratedWorkoutEditor(area, plan);
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = 'Generate workout'; }
      const errEl = document.createElement('div');
      errEl.id = 'gw-error';
      errEl.className = 'ai-note';
      errEl.style.color = 'var(--red)';
      errEl.textContent = 'Could not generate workout: ' + err.message;
      area.appendChild(errEl);
    }
  }

  function renderGeneratedWorkoutEditor(area, plan) {
    area.innerHTML = `
      <div class="ai-note">${esc(plan.warmup)} &mdash; ${esc(plan.notes)} ${esc(plan.cooldown)}</div>
      <form id="workout-form">
        <input type="hidden" name="type" value="strength">
        <div class="field">
          <label>Name</label>
          <input type="text" name="name" value="${esc(plan.name)}">
        </div>
        <div id="exercise-rows"></div>
        <button type="button" class="add-exercise-btn" data-action="add-exercise-row">+ Add exercise</button>
        <button type="submit" class="btn">Save workout</button>
      </form>
    `;
    (plan.exercises || []).forEach(ex => addExerciseRow({ name: ex.name, sets: ex.sets, reps: ex.reps }));
  }

  async function generateWorkoutPlan(focus, equipment, level, duration, notes) {
    const s = state.data.settings;
    const equipmentText = equipment.length ? equipment.join(', ') : 'bodyweight only';
    let promptText = `Design a single ${duration}-minute workout session for a ${level.toLowerCase()} lifter, focused on: ${focus}. Available equipment: ${equipmentText}.`;
    if (notes) promptText += ` Additional constraints from the user: ${notes}.`;
    promptText += ' Choose 5-8 exercises appropriate for the stated level, focus, equipment, and duration, ordering compound movements before isolation work. Give sensible sets and reps for each. Keep the warmup and cooldown suggestions to one short sentence each, and notes to one short sentence of coaching advice (e.g. progression or form cue relevant to this session).';

    const body = {
      model: (s.aiModel || 'claude-opus-4-8').trim().toLowerCase(),
      max_tokens: 1536,
      messages: [{ role: 'user', content: promptText }],
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Short session name, e.g. "Upper Body Strength"' },
              warmup: { type: 'string' },
              exercises: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    sets: { type: 'integer' },
                    reps: { type: 'integer' }
                  },
                  required: ['name', 'sets', 'reps'],
                  additionalProperties: false
                }
              },
              cooldown: { type: 'string' },
              notes: { type: 'string' }
            },
            required: ['name', 'warmup', 'exercises', 'cooldown', 'notes'],
            additionalProperties: false
          }
        }
      }
    };

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': s.anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      let msg = 'API error (' + res.status + ')';
      try {
        const errBody = await res.json();
        if (errBody.error && errBody.error.message) msg = errBody.error.message;
      } catch (e) { /* ignore parse failure */ }
      throw new Error(msg);
    }

    const data = await res.json();
    if (data.stop_reason === 'refusal') {
      throw new Error('The model declined to generate this workout.');
    }
    const textBlock = (data.content || []).find(b => b.type === 'text');
    if (!textBlock) throw new Error('No result returned.');
    return JSON.parse(textBlock.text);
  }

  function openAddWeightSheet() {
    openSheet(`
      <div class="sheet-header"><h2>Log weight</h2><button class="sheet-close" data-action="backdrop-close">&#10005;</button></div>
      <form id="weight-form">
        <div class="field">
          <label>Weight (${state.data.settings.unit})</label>
          <input type="number" name="weight" min="0" step="0.1" required autofocus>
        </div>
        <div class="field">
          <label>Date</label>
          <input type="date" name="date" value="${todayStr()}" max="${todayStr()}" required>
        </div>
        <button type="submit" class="btn">Save</button>
      </form>
    `);
  }

  // ---------- event wiring ----------
  document.querySelector('.tabbar').addEventListener('click', e => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    state.tab = btn.dataset.tab;
    render();
  });

  document.addEventListener('click', e => {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;

    if (action === 'date-prev' || action === 'date-next') {
      const scope = actionEl.dataset.scope;
      const delta = action === 'date-prev' ? -1 : 1;
      state.date[scope] = shiftDate(state.date[scope], delta);
      render();
    } else if (action === 'open-add-meal') {
      openAddMealSheet();
    } else if (action === 'open-add-workout') {
      openAddWorkoutSheet();
    } else if (action === 'open-generate-workout') {
      openGenerateWorkoutSheet();
    } else if (action === 'set-focus') {
      genPrefs.focus = actionEl.dataset.focus;
      document.querySelectorAll('[data-action="set-focus"]').forEach(b => b.classList.toggle('active', b.dataset.focus === genPrefs.focus));
    } else if (action === 'set-level') {
      genPrefs.level = actionEl.dataset.level;
      document.querySelectorAll('[data-action="set-level"]').forEach(b => b.classList.toggle('active', b.dataset.level === genPrefs.level));
    } else if (action === 'toggle-equipment') {
      const eq = actionEl.dataset.equipment;
      if (genPrefs.equipment.has(eq)) genPrefs.equipment.delete(eq); else genPrefs.equipment.add(eq);
      actionEl.classList.toggle('active', genPrefs.equipment.has(eq));
    } else if (action === 'generate-workout') {
      runGenerateWorkout();
    } else if (action === 'open-add-weight') {
      openAddWeightSheet();
    } else if (action === 'delete-meal') {
      if (confirm('Delete this meal?')) {
        state.data.meals = state.data.meals.filter(m => m.id !== actionEl.dataset.id);
        save(); render();
      }
    } else if (action === 'delete-workout') {
      if (confirm('Delete this workout?')) {
        state.data.workouts = state.data.workouts.filter(w => w.id !== actionEl.dataset.id);
        save(); render();
      }
    } else if (action === 'delete-weight') {
      if (confirm('Delete this weight entry?')) {
        state.data.weights = state.data.weights.filter(w => w.id !== actionEl.dataset.id);
        save(); render();
      }
    } else if (action === 'clear-data') {
      if (confirm('This will permanently delete all meals, workouts, and weight entries on this device. Continue?')) {
        state.data = JSON.parse(JSON.stringify(defaultData));
        save(); render();
      }
    } else if (action === 'backdrop-close') {
      if (e.target === actionEl) closeSheet();
    } else if (action === 'set-unit') {
      state.data.settings.unit = actionEl.dataset.unit;
      save();
      document.querySelectorAll('[data-action="set-unit"]').forEach(b => b.classList.toggle('active', b.dataset.unit === actionEl.dataset.unit));
    } else if (action === 'set-workout-type') {
      const type = actionEl.dataset.type;
      document.querySelectorAll('[data-action="set-workout-type"]').forEach(b => b.classList.toggle('active', b.dataset.type === type));
      const form = document.getElementById('workout-form');
      form.querySelector('input[name="type"]').value = type;
      renderWorkoutTypeFields(type);
    } else if (action === 'add-exercise-row') {
      addExerciseRow();
    } else if (action === 'remove-exercise-row') {
      actionEl.closest('.exercise-row').remove();
    } else if (action === 'pick-meal-photo') {
      const s = state.data.settings;
      if (!s.anthropicApiKey) {
        alert('Add your Anthropic API key in Settings first to use photo scanning.');
        return;
      }
      document.getElementById('meal-photo-input').click();
    } else if (action === 'remove-meal-photo') {
      pendingPhoto = null;
      document.getElementById('meal-photo-area').innerHTML = '';
      document.querySelectorAll('.ai-note').forEach(n => n.remove());
      const input = document.getElementById('meal-photo-input');
      if (input) input.value = '';
    } else if (action === 'analyze-meal-photo') {
      document.querySelectorAll('.ai-note').forEach(n => n.remove());
      runMealPhotoAnalysis();
    } else if (action === 'scan-barcode') {
      startBarcodeScan();
    } else if (action === 'stop-barcode') {
      stopBarcodeScanner();
      const area = document.getElementById('barcode-area');
      if (area) area.innerHTML = '';
    }
  });

  document.addEventListener('change', e => {
    if (e.target.id === 'meal-photo-input') {
      const file = e.target.files && e.target.files[0];
      if (file) handleMealPhoto(file);
    }
  });

  document.addEventListener('input', e => {
    if (e.target.id === 'bc-amount') {
      applyBarcodeAmount(e.target.value);
    }
  });

  // ---------- Barcode scanning (Open Food Facts) ----------
  let activeScanner = null;
  let barcodeBasis = null;

  function loadZXing() {
    return new Promise((resolve, reject) => {
      if (window.ZXing) return resolve(window.ZXing);
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
      script.onload = () => window.ZXing ? resolve(window.ZXing) : reject(new Error('Barcode scanner failed to load.'));
      script.onerror = () => reject(new Error('Could not load the barcode scanner — check your internet connection.'));
      document.head.appendChild(script);
    });
  }

  function stopBarcodeScanner() {
    if (!activeScanner) return;
    try { if (activeScanner.controls) activeScanner.controls.stop(); } catch (e) { /* ignore */ }
    try {
      const v = document.getElementById('barcode-video');
      if (v && v.srcObject) v.srcObject.getTracks().forEach(t => t.stop());
    } catch (e) { /* ignore */ }
    activeScanner = null;
  }

  async function startBarcodeScan() {
    const area = document.getElementById('barcode-area');
    if (!area) return;
    stopBarcodeScanner();
    barcodeBasis = null;
    document.getElementById('meal-photo-area').innerHTML = '';
    document.querySelectorAll('.ai-note').forEach(n => n.remove());

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      area.innerHTML = `<div class="ai-note" style="color:var(--red)">This browser can't access the camera. Open the app over https on your phone.</div>`;
      return;
    }

    area.innerHTML = `
      <div class="scanner-wrap">
        <video id="barcode-video" playsinline muted autoplay></video>
        <div class="scanner-frame"></div>
        <button type="button" class="photo-remove" data-action="stop-barcode">&#10005;</button>
        <div class="scanner-hint" id="barcode-hint">Point the camera at the barcode&hellip;</div>
      </div>
    `;

    let ZXing;
    try {
      ZXing = await loadZXing();
    } catch (err) {
      area.innerHTML = `<div class="ai-note" style="color:var(--red)">${esc(err.message)}</div>`;
      return;
    }
    if (!document.getElementById('barcode-video')) return; // sheet closed while loading

    const video = document.getElementById('barcode-video');
    const reader = new ZXing.BrowserMultiFormatReader();
    activeScanner = { controls: null, reader };
    try {
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: 'environment' } },
        video,
        (result, err, ctrl) => {
          if (ctrl && activeScanner) activeScanner.controls = ctrl;
          if (result) {
            const code = result.getText();
            stopBarcodeScanner();
            onBarcodeDetected(code);
          }
        }
      );
      if (activeScanner) activeScanner.controls = controls;
    } catch (err) {
      const hint = document.getElementById('barcode-hint');
      const msg = /permission|denied|NotAllowed/i.test(err.name + err.message)
        ? 'Camera access was blocked. Allow camera access and try again.'
        : 'Could not start the camera: ' + err.message;
      if (hint) { hint.textContent = msg; hint.style.color = 'var(--red)'; }
    }
  }

  async function onBarcodeDetected(code) {
    const area = document.getElementById('barcode-area');
    if (!area) return;
    area.innerHTML = `<div class="ai-note">Looking up barcode ${esc(code)}&hellip;</div>`;
    try {
      const product = await lookupBarcode(code);
      showBarcodeResult(area, product);
    } catch (err) {
      area.innerHTML = `
        <div class="ai-note" style="color:var(--red)">${esc(err.message)}</div>
        <button type="button" class="btn secondary" data-action="scan-barcode" style="margin-bottom:16px">Scan again</button>
      `;
    }
  }

  async function lookupBarcode(code) {
    const url = `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Lookup failed (' + res.status + '). Try again.');
    const data = await res.json();
    if (data.status !== 1 || !data.product) {
      throw new Error('That barcode isn\'t in the Open Food Facts database yet. Try the AI photo instead, or enter it manually.');
    }
    const p = data.product;
    const per100 = parseNutriments(p);
    if (!per100.cal && !per100.p && !per100.c && !per100.f) {
      throw new Error('Found the product, but it has no nutrition info recorded. Enter it manually or use the AI photo.');
    }
    let name = (p.product_name || '').trim();
    if (p.brands) name = name ? name + ' (' + String(p.brands).split(',')[0].trim() + ')' : String(p.brands).split(',')[0].trim();
    if (!name) name = 'Scanned item';
    const serving = Number(p.serving_quantity) > 0 ? Number(p.serving_quantity) : 100;
    return { name, per100, serving };
  }

  function parseNutriments(p) {
    const n = p.nutriments || {};
    const num = v => { const x = Number(v); return isFinite(x) ? x : 0; };
    let cal = num(n['energy-kcal_100g']);
    if (!cal && n['energy_100g']) cal = num(n['energy_100g']) / 4.184; // kJ -> kcal
    return {
      cal: Math.round(cal),
      p: Math.round(num(n['proteins_100g'])),
      c: Math.round(num(n['carbohydrates_100g'])),
      f: Math.round(num(n['fat_100g']))
    };
  }

  function showBarcodeResult(area, product) {
    barcodeBasis = product;
    const form = document.getElementById('meal-form');
    if (form) form.querySelector('[name="name"]').value = product.name;
    area.innerHTML = `
      <div class="ai-note">Found: <b>${esc(product.name)}</b>. Set how much you ate &mdash; calories and macros update automatically (per 100g: ${product.per100.cal} kcal).</div>
      <div class="field">
        <label>Amount eaten (grams)</label>
        <input type="number" id="bc-amount" min="0" step="1" value="${product.serving}">
      </div>
      <button type="button" class="photo-remove" style="position:static; float:right; margin-bottom:8px" data-action="stop-barcode">&#10005;</button>
    `;
    applyBarcodeAmount(product.serving);
  }

  function applyBarcodeAmount(grams) {
    if (!barcodeBasis) return;
    const form = document.getElementById('meal-form');
    if (!form) return;
    const factor = (Number(grams) || 0) / 100;
    form.querySelector('[name="calories"]').value = Math.round(barcodeBasis.per100.cal * factor);
    form.querySelector('[name="protein"]').value = Math.round(barcodeBasis.per100.p * factor);
    form.querySelector('[name="carbs"]').value = Math.round(barcodeBasis.per100.c * factor);
    form.querySelector('[name="fat"]').value = Math.round(barcodeBasis.per100.f * factor);
  }

  // ---------- AI meal photo analysis ----------
  let pendingPhoto = null;

  function resizeImage(file, maxDim = 1568, quality = 0.88) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read image file'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Could not decode image'));
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const scale = maxDim / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve({ dataUrl, base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleMealPhoto(file) {
    const area = document.getElementById('meal-photo-area');
    if (!area) return;
    let resized;
    try {
      resized = await resizeImage(file);
    } catch (err) {
      alert('Could not process that photo: ' + err.message);
      return;
    }
    pendingPhoto = resized;

    area.innerHTML = `
      <div class="photo-preview-wrap">
        <img src="${resized.dataUrl}" alt="Meal photo">
        <button type="button" class="photo-remove" data-action="remove-meal-photo">&#10005;</button>
      </div>
      <div class="field">
        <label>What is this, exactly? (optional, improves accuracy)</label>
        <input type="text" id="meal-photo-caption" placeholder="e.g. turkey and swiss on rye, no mayo">
      </div>
      <button type="button" class="btn secondary" data-action="analyze-meal-photo" style="margin-bottom:16px">Analyze photo</button>
    `;
  }

  async function runMealPhotoAnalysis() {
    if (!pendingPhoto) return;
    const area = document.getElementById('meal-photo-area');
    const captionInput = document.getElementById('meal-photo-caption');
    const caption = captionInput ? captionInput.value.trim() : '';
    const analyzeBtn = document.querySelector('[data-action="analyze-meal-photo"]');
    if (analyzeBtn) { analyzeBtn.disabled = true; analyzeBtn.textContent = 'Analyzing…'; }

    try {
      const result = await analyzeMealPhoto(pendingPhoto.base64, pendingPhoto.mediaType, caption);
      const form = document.getElementById('meal-form');
      if (form) {
        if (result.name) form.querySelector('[name="name"]').value = result.name;
        form.querySelector('[name="calories"]').value = result.calories;
        form.querySelector('[name="protein"]').value = result.protein;
        form.querySelector('[name="carbs"]').value = result.carbs;
        form.querySelector('[name="fat"]').value = result.fat;
      }
      const captionField = document.querySelector('#meal-photo-area .field');
      if (captionField) captionField.remove();
      if (analyzeBtn) analyzeBtn.remove();
      if (result.notes && area) {
        const note = document.createElement('div');
        note.className = 'ai-note';
        note.textContent = 'AI estimate: ' + result.notes + ' Review and adjust before saving.';
        area.after(note);
      }
    } catch (err) {
      if (analyzeBtn) { analyzeBtn.disabled = false; analyzeBtn.textContent = 'Retry analysis'; }
      const errNote = document.createElement('div');
      errNote.className = 'ai-note';
      errNote.style.color = 'var(--red)';
      errNote.textContent = 'Could not analyze photo: ' + err.message;
      area.appendChild(errNote);
    }
  }

  async function analyzeMealPhoto(base64, mediaType, caption) {
    const s = state.data.settings;
    let promptText = 'Look closely at this photo before answering. Identify the dish based strictly on what is visibly there: shape, color, texture, any visible cross-section or filling, plating, and portion size relative to the plate/container. Do not default to a generic "typical" version of a dish that looks similar if the visible evidence points elsewhere (e.g. a pale cream filling is not automatically vanilla or dairy-based; a dark filling is not automatically chocolate or meat) — describe what you actually see and let that drive the identification.';
    if (caption) {
      promptText += ` The user has told you what this actually is: "${caption}". Trust this over your own visual guess about identity or ingredients, and use it to make the estimate accurate.`;
    }
    promptText += ' Then estimate total calories and macros (protein, carbs, fat in grams) for the visible portion. In "notes", state in one sentence what specific visual evidence you based the identification on, and flag anything you had to assume rather than see.';

    const body = {
      model: (s.aiModel || 'claude-opus-4-8').trim().toLowerCase(),
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: promptText }
        ]
      }],
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Short name for the meal, e.g. "Grilled chicken salad"' },
              calories: { type: 'integer' },
              protein: { type: 'integer', description: 'grams' },
              carbs: { type: 'integer', description: 'grams' },
              fat: { type: 'integer', description: 'grams' },
              notes: { type: 'string', description: 'One short sentence noting assumptions or confidence in the estimate.' }
            },
            required: ['name', 'calories', 'protein', 'carbs', 'fat', 'notes'],
            additionalProperties: false
          }
        }
      }
    };

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': s.anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      let msg = 'API error (' + res.status + ')';
      try {
        const errBody = await res.json();
        if (errBody.error && errBody.error.message) msg = errBody.error.message;
      } catch (e) { /* ignore parse failure */ }
      throw new Error(msg);
    }

    const data = await res.json();
    if (data.stop_reason === 'refusal') {
      throw new Error('The model declined to analyze this image.');
    }
    const textBlock = (data.content || []).find(b => b.type === 'text');
    if (!textBlock) throw new Error('No result returned.');
    return JSON.parse(textBlock.text);
  }

  // sheet backdrop click-outside close (click directly on backdrop, not sheet content)
  modalRoot.addEventListener('click', e => {
    if (e.target.classList.contains('sheet-backdrop')) closeSheet();
  });

  // form submits
  document.addEventListener('submit', e => {
    if (e.target.id === 'meal-form') {
      e.preventDefault();
      const f = new FormData(e.target);
      state.data.meals.push({
        id: uid(),
        date: state.date.meals,
        time: f.get('time') || '',
        name: f.get('name').trim(),
        calories: Number(f.get('calories')) || 0,
        protein: Number(f.get('protein')) || 0,
        carbs: Number(f.get('carbs')) || 0,
        fat: Number(f.get('fat')) || 0
      });
      save(); closeSheet(); render();
    } else if (e.target.id === 'workout-form') {
      e.preventDefault();
      const f = new FormData(e.target);
      const type = f.get('type');
      const entry = { id: uid(), date: state.date.workouts, name: f.get('name').trim(), type };
      if (type === 'cardio') {
        entry.cardio = {
          duration: Number(f.get('duration')) || 0,
          distance: Number(f.get('distance')) || 0
        };
      } else {
        entry.exercises = Array.from(document.querySelectorAll('#exercise-rows .exercise-row')).map(row => ({
          name: row.querySelector('.ex-name').value.trim(),
          sets: Number(row.querySelector('.ex-sets').value) || 0,
          reps: Number(row.querySelector('.ex-reps').value) || 0,
          weight: Number(row.querySelector('.ex-weight').value) || 0
        })).filter(ex => ex.name);
      }
      state.data.workouts.push(entry);
      save(); closeSheet(); render();
    } else if (e.target.id === 'weight-form') {
      e.preventDefault();
      const f = new FormData(e.target);
      state.data.weights.push({
        id: uid(),
        date: f.get('date') || todayStr(),
        weight: Number(f.get('weight'))
      });
      save(); closeSheet(); render();
    } else if (e.target.id === 'settings-form') {
      e.preventDefault();
      const f = new FormData(e.target);
      const s = state.data.settings;
      s.calorieGoal = Number(f.get('calorieGoal')) || 0;
      s.proteinGoal = Number(f.get('proteinGoal')) || 0;
      s.carbGoal = Number(f.get('carbGoal')) || 0;
      s.fatGoal = Number(f.get('fatGoal')) || 0;
      const tw = f.get('targetWeight');
      s.targetWeight = tw ? Number(tw) : null;
      save();
      alert('Goals saved.');
    } else if (e.target.id === 'ai-settings-form') {
      e.preventDefault();
      const f = new FormData(e.target);
      const s = state.data.settings;
      s.anthropicApiKey = (f.get('anthropicApiKey') || '').trim();
      s.aiModel = (f.get('aiModel') || 'claude-opus-4-8').trim().toLowerCase() || 'claude-opus-4-8';
      save();
      alert('API settings saved.');
    }
  });

  window.addEventListener('resize', () => { if (state.tab === 'weight') drawWeightChart(); });

  document.getElementById('exercise-library').innerHTML =
    EXERCISE_LIBRARY.map(name => `<option value="${esc(name)}">`).join('');

  render();
})();
