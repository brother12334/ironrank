const pages = {
  log: `
  <div class="card">
    <label>Friend</label>
    <select id="user"></select>
    <input id="exercise" placeholder="Exercise (e.g. Bench Press)" />
    <div style="display:flex;gap:8px;">
      <input id="sets" type="number" placeholder="Sets" />
      <input id="reps" type="number" placeholder="Reps" />
      <input id="weight" type="number" placeholder="Weight" />
    </div>
    <label><input type="checkbox" id="toFailure" /> To failure</label>
    <button id="addLog">Add Log</button>
  </div>
  <div id="recentLogs"></div>
  `,
  leaderboard: `
    <div id="leaderboard"></div>
  `,
  settings: `
    <div class="card">
      <input id="newUser" placeholder="Add friend name" />
      <button id="addUser">Add Friend</button>
    </div>
  `
};

const app = document.getElementById("content");
const navButtons = document.querySelectorAll(".tabbar button");

function load(key, def = []) {
  return JSON.parse(localStorage.getItem(key) || JSON.stringify(def));
}
function save(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

function detectMuscle(exercise) {
  const lower = exercise.toLowerCase();
  for (const [muscle, list] of Object.entries(MUSCLE_KEYWORDS)) {
    if (list.some(word => lower.includes(word))) return muscle;
  }
  return "other";
}

function scoreLog(log) {
  let base = log.sets * log.reps * (log.weight || 1);
  if (log.toFailure) base += 20;
  return base;
}

function render(page) {
  app.innerHTML = pages[page];
  navButtons.forEach(b => b.classList.toggle("active", b.dataset.page === page));

  if (page === "log") setupLogPage();
  if (page === "leaderboard") renderLeaderboard();
  if (page === "settings") setupSettings();
}

function setupLogPage() {
  const users = load("users");
  const select = document.getElementById("user");
  select.innerHTML = users.map(u => `<option>${u}</option>`).join("");

  document.getElementById("addLog").onclick = () => {
    const user = select.value;
    const exercise = document.getElementById("exercise").value.trim();
    const sets = +document.getElementById("sets").value || 0;
    const reps = +document.getElementById("reps").value || 0;
    const weight = +document.getElementById("weight").value || 0;
    const toFailure = document.getElementById("toFailure").checked;
    const muscle = detectMuscle(exercise);

    const logs = load("logs");
    logs.push({ user, exercise, sets, reps, weight, toFailure, muscle });
    save("logs", logs);
    render("log");
  };
  renderRecentLogs();
}

function renderRecentLogs() {
  const logs = load("logs").slice(-10).reverse();
  const div = document.getElementById("recentLogs");
  div.innerHTML = logs.map(l => `
    <div class="card">
      <div>${l.user} — <b>${l.exercise}</b></div>
      <div class="score">${scoreLog(l).toFixed(0)}</div>
    </div>
  `).join("");
}

function renderLeaderboard() {
  const logs = load("logs");
  const users = load("users");
  const table = [];

  users.forEach(u => {
    const ul = logs.filter(l => l.user === u);
    const total = ul.reduce((s, l) => s + scoreLog(l), 0);
    table.push({ user: u, score: total });
  });

  table.sort((a, b) => b.score - a.score);

  document.getElementById("leaderboard").innerHTML = `
    <table class="table">
      <tr><th>Rank</th><th>Name</th><th>Score</th></tr>
      ${table.map((r, i) => `
        <tr><td>${i + 1}</td><td>${r.user}</td><td class="score">${r.score.toFixed(0)}</td></tr>
      `).join("")}
    </table>
  `;
}

function setupSettings() {
  document.getElementById("addUser").onclick = () => {
    const name = document.getElementById("newUser").value.trim();
    if (!name) return;
    const users = load("users");
    users.push(name);
    save("users", users);
    alert("added!");
  };
}

navButtons.forEach(b => {
  b.onclick = () => render(b.dataset.page);
});

if (!localStorage.getItem("users")) save("users", ["phineas"]);
if (!localStorage.getItem("logs")) save("logs", []);

render("log");
