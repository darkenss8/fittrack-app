(function () {
  'use strict';

  const STORAGE_KEY = 'fittrack_data_v1';

  // Prefer the bundled 800+ exercise library (exercises.js). Fall back to this
  // built-in shortlist if that file is missing.
  const EXERCISE_LIBRARY = (window.EXERCISE_LIBRARY && window.EXERCISE_LIBRARY.length) ? window.EXERCISE_LIBRARY : [
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
    const tappable = w.type !== 'cardio' && (w.exercises || []).length;
    return `
      <div class="list-item">
        <div class="li-main"${tappable ? ` data-action="open-workout" data-id="${w.id}" style="cursor:pointer"` : ''}>
          <div class="li-title">${esc(w.name || (w.type === 'cardio' ? 'Cardio' : 'Strength'))}${tappable ? ' <span class="li-chev">&rsaquo;</span>' : ''}</div>
          <div class="li-sub">${sub}${tappable ? ' &middot; tap to see how' : ''}</div>
        </div>
        <button class="li-del" data-action="delete-workout" data-id="${w.id}">&#10005;</button>
      </div>`;
  }

  function openWorkoutDetail(id) {
    const w = state.data.workouts.find(x => x.id === id);
    if (!w) return;
    const rows = (w.exercises || []).map(ex => {
      const bits = [];
      if (ex.sets) bits.push(ex.sets + ' sets');
      if (ex.reps) bits.push(ex.reps + ' reps');
      if (ex.weight) bits.push(ex.weight + ' ' + (state.data.settings.unit || 'kg'));
      return `
        <div class="list-item">
          <div class="li-main">
            <div class="li-title">${esc(ex.name)}</div>
            <div class="li-sub">${bits.join(' &middot; ') || 'No sets/reps recorded'}</div>
          </div>
          <button type="button" class="demo-link" style="margin:0" data-action="show-demo" data-name="${esc(ex.name)}">&#9654; How to</button>
        </div>`;
    }).join('');
    openSheet(`
      <div class="sheet-header"><h2>${esc(w.name || 'Workout')}</h2><button class="sheet-close" data-action="backdrop-close">&#10005;</button></div>
      ${rows || '<div class="empty-state">No exercises recorded.</div>'}
    `);
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
      <button type="button" class="photo-btn" data-action="describe-meal">&#9998; Describe a meal in words (AI)</button>
      <button type="button" class="photo-btn" data-action="scan-barcode">&#9974; Scan a barcode (packaged food)</button>
      <div id="barcode-area"></div>
      <div id="describe-area"></div>
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
        <div class="ex-row-links">
          <button type="button" class="demo-link" data-action="browse-exercises">&#128269; Browse list</button>
          <button type="button" class="demo-link" data-action="show-demo">&#9654; How to do this</button>
        </div>
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
    } else if (action === 'open-workout') {
      openWorkoutDetail(actionEl.dataset.id);
    } else if (action === 'show-demo') {
      let name = actionEl.dataset.name;
      if (!name) {
        const row = actionEl.closest('.exercise-row');
        const input = row && row.querySelector('.ex-name');
        name = input ? input.value.trim() : '';
      }
      if (!name) { alert('Type or pick an exercise first.'); return; }
      openExerciseDemo(name);
    } else if (action === 'close-demo') {
      if (e.target === actionEl) closeExerciseDemo();
    } else if (action === 'browse-exercises') {
      const row = actionEl.closest('.exercise-row');
      const input = row && row.querySelector('.ex-name');
      if (input) openExercisePicker(input);
    } else if (action === 'close-picker') {
      if (e.target === actionEl) closeExercisePicker();
    } else if (action === 'picker-group') {
      pickerGroup = actionEl.dataset.group;
      document.querySelectorAll('[data-action="picker-group"]').forEach(b => b.classList.toggle('active', b.dataset.group === pickerGroup));
      const s = document.getElementById('picker-search');
      renderPickerList(s ? s.value : '');
    } else if (action === 'pick-exercise') {
      if (pickerTargetInput) pickerTargetInput.value = actionEl.dataset.name;
      closeExercisePicker();
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
    } else if (action === 'describe-meal') {
      openDescribeMeal();
    } else if (action === 'run-describe-meal') {
      runDescribeMeal();
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
    } else if (e.target.id === 'picker-search') {
      renderPickerList(e.target.value);
    }
  });

  // ---------- Exercise demo (form photos + YouTube) ----------
  let demoTimer = null;
  let _exIndex = null;

  function normalizeExName(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function buildExIndex() {
    if (_exIndex) return _exIndex;
    _exIndex = [];
    const imgs = window.EXERCISE_IMAGES || {};
    for (const name in imgs) {
      const norm = normalizeExName(name);
      _exIndex.push({ name, norm, tokens: new Set(norm.split(' ').filter(Boolean)), paths: imgs[name] });
    }
    return _exIndex;
  }

  // Find the best-matching exercise photo set for an arbitrary name
  // (exact -> normalized -> fuzzy token overlap). Returns {name, paths} or null.
  function findExerciseImages(name) {
    const imgs = window.EXERCISE_IMAGES || {};
    if (imgs[name]) return { name: name, paths: imgs[name] };
    const q = normalizeExName(name);
    if (!q) return null;
    const idx = buildExIndex();
    for (const e of idx) if (e.norm === q) return { name: e.name, paths: e.paths };
    const qtok = q.split(' ').filter(Boolean);
    const qset = new Set(qtok);
    const qlast = qtok[qtok.length - 1];
    let best = null, bestScore = 0;
    for (const e of idx) {
      let shared = 0;
      qset.forEach(t => { if (e.tokens.has(t)) shared++; });
      const union = qset.size + e.tokens.size - shared;
      let score = union ? shared / union : 0;
      if (qlast && e.tokens.has(qlast)) score += 0.15; // reward matching the movement word
      if (score > bestScore) { bestScore = score; best = e; }
    }
    return bestScore >= 0.4 ? { name: best.name, paths: best.paths } : null;
  }

  function openExerciseDemo(name) {
    closeExerciseDemo();
    const root = document.getElementById('demo-root');
    if (!root) return;
    const base = window.EXERCISE_IMG_BASE || '';
    const match = findExerciseImages(name);
    const imgs = match ? match.paths.map(p => base + p) : null;
    const approx = match && normalizeExName(match.name) !== normalizeExName(name);
    // YouTube Shorts search — fast, short clips
    const yt = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(name + ' exercise form') + '&sp=EgIYAQ%3D%3D';
    root.innerHTML = `
      <div class="sheet-backdrop demo-backdrop" data-action="close-demo">
        <div class="demo-card" data-demo>
          <div class="sheet-header"><h2>${esc(name)}</h2><button class="sheet-close" data-action="close-demo">&#10005;</button></div>
          <div id="demo-photo-area">${imgs
            ? `<div class="demo-img-wrap"><img id="demo-img" src="${imgs[0]}" alt="${esc(name)} demonstration"></div>
               <div class="ai-note" style="margin-top:0">${approx ? 'Closest match: <b>' + esc(match.name) + '</b>. ' : ''}Looping the start and end positions of the movement.</div>`
            : `<div class="ai-note" style="margin-top:0">No built-in photo for this one &mdash; tap the video below.</div>`}</div>
          <a class="btn" href="${yt}" target="_blank" rel="noopener">&#9654; Watch a short video on YouTube</a>
        </div>
      </div>`;
    if (imgs) {
      const el = document.getElementById('demo-img');
      // If the photo fails to load (network/host issue), fall back to video-only
      if (el) el.onerror = () => {
        if (demoTimer) { clearInterval(demoTimer); demoTimer = null; }
        const area = document.getElementById('demo-photo-area');
        if (area) area.innerHTML = `<div class="ai-note" style="margin-top:0">Couldn't load the demo photo &mdash; tap the video below.</div>`;
      };
      if (imgs.length > 1) {
        let i = 0;
        demoTimer = setInterval(() => {
          i = (i + 1) % imgs.length;
          const cur = document.getElementById('demo-img');
          if (cur) cur.src = imgs[i];
        }, 1100);
      }
    }
  }

  function closeExerciseDemo() {
    if (demoTimer) { clearInterval(demoTimer); demoTimer = null; }
    const root = document.getElementById('demo-root');
    if (root) root.innerHTML = '';
  }

  // ---------- Exercise picker (search + body-part filters) ----------
  const PICKER_GROUPS = ['All', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core', 'Cardio'];
  let pickerTargetInput = null;
  let pickerGroup = 'All';

  function openExercisePicker(inputEl) {
    pickerTargetInput = inputEl;
    pickerGroup = 'All';
    const root = document.getElementById('picker-root');
    if (!root) return;
    root.innerHTML = `
      <div class="sheet-backdrop picker-backdrop" data-action="close-picker">
        <div class="picker-panel" data-picker>
          <div class="sheet-header"><h2>Pick exercise</h2><button class="sheet-close" data-action="close-picker">&#10005;</button></div>
          <input type="text" id="picker-search" placeholder="Search 800+ exercises&hellip;" autocapitalize="off" autocorrect="off" spellcheck="false">
          <div class="chip-row picker-groups">
            ${PICKER_GROUPS.map((g, i) => `<button type="button" class="chip${i === 0 ? ' active' : ''}" data-action="picker-group" data-group="${g}">${g}</button>`).join('')}
          </div>
          <div id="picker-list" class="picker-list"></div>
        </div>
      </div>`;
    renderPickerList('');
    const s = document.getElementById('picker-search');
    if (s) s.focus();
  }

  function closeExercisePicker() {
    const root = document.getElementById('picker-root');
    if (root) root.innerHTML = '';
    pickerTargetInput = null;
  }

  function renderPickerList(query) {
    const list = document.getElementById('picker-list');
    if (!list) return;
    const names = window.EXERCISE_LIBRARY || [];
    const groups = window.EXERCISE_GROUP || {};
    const q = (query || '').trim().toLowerCase();
    const filtered = names.filter(n => {
      if (pickerGroup !== 'All' && (groups[n] || 'Other') !== pickerGroup) return false;
      if (q && n.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    const total = filtered.length;
    const shown = filtered.slice(0, 200);
    list.innerHTML = shown.map(n => `
      <button type="button" class="picker-item" data-action="pick-exercise" data-name="${esc(n)}">
        <span class="picker-item-name">${esc(n)}</span>
        <span class="picker-item-group">${esc(groups[n] || '')}</span>
      </button>`).join('')
      + (total > 200 ? `<div class="ai-note" style="margin:8px 0 0">Showing 200 of ${total}. Keep typing to narrow it down.</div>`
        : total === 0 ? `<div class="empty-state">No matches. You can still type a custom name in the box.</div>` : '');
  }

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
    const dArea = document.getElementById('describe-area');
    if (dArea) dArea.innerHTML = '';
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

  // ---------- Describe a meal in words (AI) ----------
  function openDescribeMeal() {
    const s = state.data.settings;
    if (!s.anthropicApiKey) {
      alert('Add your Anthropic API key in Settings first to use AI meal estimates.');
      return;
    }
    document.getElementById('barcode-area').innerHTML = '';
    document.getElementById('meal-photo-area').innerHTML = '';
    const area = document.getElementById('describe-area');
    if (!area) return;
    area.innerHTML = `
      <div class="field">
        <label>Tell it what you ate</label>
        <textarea id="describe-input" rows="3" placeholder="e.g. two eggs, two slices of toast with butter, and a black coffee"></textarea>
      </div>
      <button type="button" class="btn secondary" data-action="run-describe-meal" style="margin-bottom:16px">Estimate calories</button>
    `;
    const inp = document.getElementById('describe-input');
    if (inp) inp.focus();
  }

  async function runDescribeMeal() {
    const area = document.getElementById('describe-area');
    const inp = document.getElementById('describe-input');
    const desc = inp ? inp.value.trim() : '';
    if (!desc) { alert('Type what you ate first.'); return; }
    const btn = area.querySelector('[data-action="run-describe-meal"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Estimating…'; }
    const existingErr = area.querySelector('.ai-note');
    if (existingErr) existingErr.remove();
    try {
      const result = await analyzeMealText(desc);
      const form = document.getElementById('meal-form');
      if (form) {
        if (result.name) form.querySelector('[name="name"]').value = result.name;
        form.querySelector('[name="calories"]').value = result.calories;
        form.querySelector('[name="protein"]').value = result.protein;
        form.querySelector('[name="carbs"]').value = result.carbs;
        form.querySelector('[name="fat"]').value = result.fat;
      }
      area.innerHTML = result.notes
        ? `<div class="ai-note">AI estimate: ${esc(result.notes)} Review and adjust before saving.</div>`
        : '';
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = 'Retry estimate'; }
      const errEl = document.createElement('div');
      errEl.className = 'ai-note';
      errEl.style.color = 'var(--red)';
      errEl.textContent = 'Could not estimate: ' + err.message;
      area.appendChild(errEl);
    }
  }

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
    const dArea = document.getElementById('describe-area');
    if (dArea) dArea.innerHTML = '';
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
        <label>Add any details to improve the estimate (optional)</label>
        <textarea id="meal-photo-caption" rows="2" placeholder="e.g. it's beef not chicken · large portion · no oil · I only ate half"></textarea>
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

  const MEAL_SCHEMA = {
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
  };

  // Shared call to the Anthropic API for a meal estimate. `content` is the
  // user message content array (text, or image + text). Returns parsed JSON.
  async function mealEstimateRequest(content) {
    const s = state.data.settings;
    const body = {
      model: (s.aiModel || 'claude-opus-4-8').trim().toLowerCase(),
      max_tokens: 1024,
      messages: [{ role: 'user', content: content }],
      output_config: { format: { type: 'json_schema', schema: MEAL_SCHEMA } }
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
      throw new Error('The model declined this request.');
    }
    const textBlock = (data.content || []).find(b => b.type === 'text');
    if (!textBlock) throw new Error('No result returned.');
    return JSON.parse(textBlock.text);
  }

  async function analyzeMealPhoto(base64, mediaType, caption) {
    let promptText = 'Look closely at this photo before answering. Identify the dish based strictly on what is visibly there: shape, color, texture, any visible cross-section or filling, plating, and portion size relative to the plate/container. Do not default to a generic "typical" version of a dish that looks similar if the visible evidence points elsewhere (e.g. a pale cream filling is not automatically vanilla or dairy-based; a dark filling is not automatically chocolate or meat) — describe what you actually see and let that drive the identification.';
    if (caption) {
      promptText += ` The user added these details about the meal — they may describe what it is, the ingredients, the portion size, or how much was actually eaten. Trust these details over your own visual guess and use them to adjust the estimate: "${caption}".`;
    }
    promptText += ' Then estimate total calories and macros (protein, carbs, fat in grams) for the portion actually eaten. In "notes", state in one sentence what you based the identification on and flag anything you had to assume.';
    return mealEstimateRequest([
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
      { type: 'text', text: promptText }
    ]);
  }

  async function analyzeMealText(description) {
    const promptText = 'A user is logging a meal by describing it in their own words. Estimate the total calories and macros (protein, carbs, fat in grams) for what they describe. If they give amounts or portions, use them; if not, assume a typical single serving and say so in "notes". Give a short, clear meal name. Description: "' + description + '"';
    return mealEstimateRequest([{ type: 'text', text: promptText }]);
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
