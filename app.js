const FLEX_ORDER = ["Flexible", "Medium", "Stiff", "Extra Stiff"];
const BALANCE_ORDER = ["Head Light", "Even Balance", "Head Heavy"]; // bottom -> top on chart

let RACKETS = [];

async function loadData() {
  const res = await fetch("data/rackets.json", { cache: "no-store" });
  RACKETS = await res.json();
  populateBrandFilter();
  renderMatrix(RACKETS);
  renderList();
}

function populateBrandFilter() {
  const select = document.getElementById("brand-filter");
  const brands = [...new Set(RACKETS.map(r => r.brand))].sort();
  for (const b of brands) {
    const opt = document.createElement("option");
    opt.value = b;
    opt.textContent = b;
    select.appendChild(opt);
  }
}

function getFiltered() {
  const q = document.getElementById("search-input").value.trim().toLowerCase();
  const brand = document.getElementById("brand-filter").value;
  const balance = document.getElementById("balance-filter").value;
  const flex = document.getElementById("flex-filter").value;
  return RACKETS.filter(r => {
    if (brand && r.brand !== brand) return false;
    if (balance && r.head_balance !== balance) return false;
    if (flex && r.flex !== flex) return false;
    if (q && !(`${r.brand} ${r.model}`.toLowerCase().includes(q))) return false;
    return true;
  });
}

function renderList() {
  const list = getFiltered();
  const grid = document.getElementById("racket-grid");
  grid.innerHTML = "";
  if (list.length === 0) {
    grid.innerHTML = '<p style="color:var(--text-muted)">該当するラケットがありません。</p>';
    return;
  }
  for (const r of list) {
    const card = document.createElement("div");
    card.className = "racket-card";
    card.innerHTML = `
      <div class="brand">${escapeHtml(r.brand)}</div>
      <div class="model">${escapeHtml(r.model)}</div>
      <div class="tag-row">
        <span class="tag balance-${cssEscape(r.head_balance)}">${escapeHtml(r.head_balance)}</span>
        <span class="tag">${escapeHtml(r.flex)}</span>
      </div>
    `;
    card.addEventListener("click", () => openDetail(r.id));
    grid.appendChild(card);
  }
  renderMatrix(list);
}

function cssEscape(s) {
  return String(s).replace(/ /g, "\\ ");
}

function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderMatrix(rackets) {
  const container = document.getElementById("matrix-chart");
  const width = 640, height = 460;
  const margin = { top: 20, right: 20, bottom: 60, left: 110 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const cols = FLEX_ORDER.length;
  const rows = BALANCE_ORDER.length;
  const cellW = plotW / cols;
  const cellH = plotH / rows;

  // group rackets by cell for jitter layout
  const cells = {};
  for (const r of rackets) {
    const ci = FLEX_ORDER.indexOf(r.flex);
    const ri = BALANCE_ORDER.indexOf(r.head_balance);
    if (ci === -1 || ri === -1) continue;
    const key = `${ci}-${ri}`;
    if (!cells[key]) cells[key] = [];
    cells[key].push(r);
  }

  let svg = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" font-family="inherit">`;

  // grid background + lines
  for (let c = 0; c <= cols; c++) {
    const x = margin.left + c * cellW;
    svg += `<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${margin.top + plotH}" style="stroke:var(--border)" stroke-width="1"/>`;
  }
  for (let rIdx = 0; rIdx <= rows; rIdx++) {
    const y = margin.top + rIdx * cellH;
    svg += `<line x1="${margin.left}" y1="${y}" x2="${margin.left + plotW}" y2="${y}" style="stroke:var(--border)" stroke-width="1"/>`;
  }

  // column labels (flex, bottom)
  FLEX_ORDER.forEach((label, ci) => {
    const x = margin.left + ci * cellW + cellW / 2;
    svg += `<text x="${x}" y="${margin.top + plotH + 24}" text-anchor="middle" font-size="12" style="fill:var(--text-muted)">${escapeHtml(label)}</text>`;
  });
  svg += `<text x="${margin.left + plotW / 2}" y="${height - 6}" text-anchor="middle" font-size="12" font-weight="600" style="fill:var(--text)">硬さ (Flex) →</text>`;

  // row labels (balance, left) — index 0 (Head Light) at bottom, so invert
  BALANCE_ORDER.forEach((label, ri) => {
    const rowFromTop = rows - 1 - ri;
    const y = margin.top + rowFromTop * cellH + cellH / 2;
    svg += `<text x="${margin.left - 10}" y="${y + 4}" text-anchor="end" font-size="12" style="fill:var(--text-muted)">${escapeHtml(label)}</text>`;
  });
  svg += `<text x="20" y="${margin.top + plotH / 2}" text-anchor="middle" font-size="12" font-weight="600" style="fill:var(--text)" transform="rotate(-90 20 ${margin.top + plotH / 2})">← ヘッドバランス</text>`;

  // points
  for (const key in cells) {
    const [ci, ri] = key.split("-").map(Number);
    const rowFromTop = rows - 1 - ri;
    const group = cells[key];
    const n = group.length;
    const baseX = margin.left + ci * cellW + cellW / 2;
    const baseY = margin.top + rowFromTop * cellH + cellH / 2;
    const jitterRadius = Math.min(cellW, cellH) * 0.26;
    group.forEach((r, idx) => {
      let px = baseX, py = baseY;
      if (n > 1) {
        const angle = (2 * Math.PI * idx) / n;
        px += jitterRadius * Math.cos(angle);
        py += jitterRadius * Math.sin(angle);
      }
      svg += `<g class="matrix-point" data-id="${r.id}" transform="translate(${px},${py})">
        <circle r="7" style="fill:var(--accent);stroke:var(--panel-bg)" fill-opacity="0.85" stroke-width="1.5"/>
        <text x="0" y="-11" text-anchor="middle" font-size="10" style="fill:var(--text)">${escapeHtml(r.brand)}</text>
        <text x="0" y="20" text-anchor="middle" font-size="9" style="fill:var(--text-muted)">${escapeHtml(r.model)}</text>
      </g>`;
    });
  }

  svg += `</svg>`;
  container.innerHTML = svg;

  container.querySelectorAll(".matrix-point").forEach(el => {
    el.addEventListener("click", () => openDetail(el.dataset.id));
  });
}

function openDetail(id) {
  const r = RACKETS.find(x => x.id === id);
  if (!r) return;
  const content = document.getElementById("detail-content");
  const sources = (r.sources || []).map(u => `<li><a href="${escapeHtml(u)}" target="_blank" rel="noopener">${escapeHtml(u)}</a></li>`).join("");
  content.innerHTML = `
    <h3>${escapeHtml(r.model)}</h3>
    <div class="detail-brand">${escapeHtml(r.brand)}${r.release_year ? " ・ " + escapeHtml(r.release_year) + "年" : ""}</div>
    <table class="spec-table">
      <tr><th>ヘッドバランス</th><td>${escapeHtml(r.head_balance)}</td></tr>
      <tr><th>硬さ (Flex)</th><td>${escapeHtml(r.flex)}</td></tr>
      <tr><th>重量クラス</th><td>${escapeHtml(r.weight_class)}${r.weight_g ? `(約${r.weight_g}g)` : ""}</td></tr>
      <tr><th>バランスポイント</th><td>${r.balance_point_mm ? r.balance_point_mm + " mm" : "不明"}</td></tr>
      <tr><th>シャフト素材</th><td>${escapeHtml(r.shaft_material) || "不明"}</td></tr>
      <tr><th>フレーム素材</th><td>${escapeHtml(r.frame_material) || "不明"}</td></tr>
      <tr><th>推奨テンション</th><td>${escapeHtml(r.string_tension_lbs) || "不明"}</td></tr>
      <tr><th>参考価格</th><td>${r.price_jpy_approx ? "¥" + Number(r.price_jpy_approx).toLocaleString() + " (税抜目安)" : "不明"}</td></tr>
    </table>
    <div class="review-block">
      <h4>レビューまとめ</h4>
      <p>${escapeHtml(r.review_summary_ja)}</p>
    </div>
    <div>
      <h4 style="font-size:0.9rem;margin-bottom:4px;">出典</h4>
      <ul class="source-list">${sources}</ul>
    </div>
  `;
  document.getElementById("detail-overlay").classList.remove("hidden");
}

function closeDetail() {
  document.getElementById("detail-overlay").classList.add("hidden");
}

document.getElementById("detail-close").addEventListener("click", closeDetail);
document.getElementById("detail-overlay").addEventListener("click", e => {
  if (e.target.id === "detail-overlay") closeDetail();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeDetail();
});

["search-input", "brand-filter", "balance-filter", "flex-filter"].forEach(id => {
  document.getElementById(id).addEventListener("input", renderList);
  document.getElementById(id).addEventListener("change", renderList);
});

loadData();
