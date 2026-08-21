const FLEX_ORDER = ["Flexible", "Medium", "Stiff", "Extra Stiff"];
const BRAND_COLOR_VAR = {
  Yonex: "--brand-yonex",
  Victor: "--brand-victor",
  "Li-Ning": "--brand-lining",
  Mizuno: "--brand-mizuno"
};

let RACKETS = [];

function brandColorVar(brand) {
  return `var(${BRAND_COLOR_VAR[brand] || "--accent"})`;
}

function getBalanceMm(r) {
  return r.balance_point_mm ?? r.balance_point_mm_display ?? null;
}

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
  const plottable = rackets.filter(r => FLEX_ORDER.includes(r.flex) && getBalanceMm(r) !== null);

  const width = 680, height = 480;
  const margin = { top: 20, right: 24, bottom: 56, left: 56 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const cols = FLEX_ORDER.length;
  const colW = plotW / cols;

  // Y domain: continuous, based on actual balance point mm (with padding), rounded to nice 5mm steps
  const mmValues = plottable.map(getBalanceMm);
  const rawMin = mmValues.length ? Math.min(...mmValues) : 280;
  const rawMax = mmValues.length ? Math.max(...mmValues) : 310;
  const yMin = Math.floor((rawMin - 6) / 5) * 5;
  const yMax = Math.ceil((rawMax + 6) / 5) * 5;
  const yScale = mm => margin.top + plotH * (1 - (mm - yMin) / (yMax - yMin));

  let svg = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" font-family="inherit">`;

  // vertical guide lines between flex columns
  for (let c = 0; c <= cols; c++) {
    const x = margin.left + c * colW;
    svg += `<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${margin.top + plotH}" style="stroke:var(--border)" stroke-width="1" stroke-dasharray="${c === 0 || c === cols ? "0" : "3,3"}"/>`;
  }

  // horizontal mm ticks every 5mm
  for (let mm = yMin; mm <= yMax; mm += 5) {
    const y = yScale(mm);
    svg += `<line x1="${margin.left}" y1="${y}" x2="${margin.left + plotW}" y2="${y}" style="stroke:var(--border)" stroke-width="1" stroke-opacity="0.5"/>`;
    svg += `<text x="${margin.left - 8}" y="${y + 3}" text-anchor="end" font-size="9" style="fill:var(--text-muted)">${mm}</text>`;
  }

  // column labels (flex, bottom)
  FLEX_ORDER.forEach((label, ci) => {
    const x = margin.left + ci * colW + colW / 2;
    svg += `<text x="${x}" y="${margin.top + plotH + 20}" text-anchor="middle" font-size="12" style="fill:var(--text-muted)">${escapeHtml(label)}</text>`;
  });
  svg += `<text x="${margin.left + plotW / 2}" y="${height - 4}" text-anchor="middle" font-size="12" font-weight="600" style="fill:var(--text)">硬さ (Flex) →</text>`;

  svg += `<text x="14" y="${margin.top + 6}" font-size="10" style="fill:var(--text-muted)">Head Heavy</text>`;
  svg += `<text x="14" y="${margin.top + plotH - 2}" font-size="10" style="fill:var(--text-muted)">Head Light</text>`;
  svg += `<text x="14" y="${margin.top + plotH / 2}" text-anchor="middle" font-size="12" font-weight="600" style="fill:var(--text)" transform="rotate(-90 14 ${margin.top + plotH / 2})">バランスポイント(mm) ←→</text>`;

  // group by flex column, then resolve close-in-y collisions with left/right offsets
  const byCol = {};
  for (const r of plottable) {
    const ci = FLEX_ORDER.indexOf(r.flex);
    (byCol[ci] ||= []).push(r);
  }

  for (const ci in byCol) {
    const colCenterX = margin.left + Number(ci) * colW + colW / 2;
    const group = byCol[ci].slice().sort((a, b) => getBalanceMm(a) - getBalanceMm(b));
    const placed = []; // {py}
    const minGap = 20;
    group.forEach(r => {
      const py = yScale(getBalanceMm(r));
      let side = 0; // 0, then alternating +1,-1,+2,-2...
      let overlapCount = placed.filter(p => Math.abs(p.py - py) < minGap).length;
      if (overlapCount > 0) {
        side = Math.ceil(overlapCount / 2) * (overlapCount % 2 === 1 ? 1 : -1);
      }
      const px = colCenterX + side * 16;
      placed.push({ py });

      const isMeasured = r.balance_confidence === "measured";
      const isEstimated = r.balance_confidence === "estimated";
      const color = brandColorVar(r.brand);
      const dash = isMeasured ? "" : `stroke-dasharray="3,2"`;
      const fillOpacity = r.balance_confidence === "unknown" ? "0.15" : "0.85";

      svg += `<g class="matrix-point" data-id="${r.id}" transform="translate(${px},${py})">
        <circle r="7" style="fill:${color};stroke:${color}" fill-opacity="${fillOpacity}" stroke-width="1.5" ${dash}/>
        <text x="0" y="-11" text-anchor="middle" font-size="10" style="fill:var(--text)">${escapeHtml(r.brand)}</text>
        <text x="0" y="20" text-anchor="middle" font-size="9" style="fill:var(--text-muted)">${escapeHtml(r.model)}</text>
      </g>`;
    });
  }

  svg += `</svg>`;
  container.innerHTML = svg;

  const skipped = rackets.length - plottable.length;
  const legend = document.getElementById("matrix-legend");
  if (legend) {
    legend.innerHTML = `
      <span class="legend-item"><span class="legend-dot solid"></span>実測値ベース</span>
      <span class="legend-item"><span class="legend-dot dashed"></span>推定値(採寸データにばらつきあり)</span>
      <span class="legend-item"><span class="legend-dot hollow"></span>データなし(区分から概算配置)</span>
      ${skipped > 0 ? `<span class="legend-item">※${skipped}件は硬さ区分未確定のため図に非表示</span>` : ""}
    `;
  }

  container.querySelectorAll(".matrix-point").forEach(el => {
    el.addEventListener("click", () => openDetail(el.dataset.id));
  });
}

const CONFIDENCE_LABEL = { measured: "実測値", estimated: "推定値", unknown: "データなし(概算)" };

function balancePointCellHtml(r) {
  const mm = getBalanceMm(r);
  if (mm === null) return "不明";
  const confLabel = CONFIDENCE_LABEL[r.balance_confidence] || "";
  let html = `${mm} mm${confLabel ? ` <span style="color:var(--text-muted);font-size:0.85em;">(${escapeHtml(confLabel)})</span>` : ""}`;
  if (r.balance_note) {
    html += `<div style="font-size:0.8em;color:var(--text-muted);margin-top:3px;">${escapeHtml(r.balance_note)}</div>`;
  }
  return html;
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
      <tr><th>バランスポイント</th><td>${balancePointCellHtml(r)}</td></tr>
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
