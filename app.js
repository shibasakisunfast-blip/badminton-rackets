const FLEX_ORDER = ["Flexible", "Medium", "Stiff", "Extra Stiff"];
const BRAND_COLOR_VAR = {
  Yonex: "--brand-yonex",
  Victor: "--brand-victor",
  "Li-Ning": "--brand-lining",
  Mizuno: "--brand-mizuno"
};
const CONFIDENCE_LABEL = { measured: "実測値", estimated: "推定値", unknown: "データなし(概算)" };

// Swing weight approximation: treats the racket as a point mass at its balance
// point, rotating about a pivot ~100mm from the butt cap (a common simplification
// used for racket-sport swingweight estimates). This is NOT a lab-measured moment
// of inertia — actual MOI depends on the full mass distribution along the frame,
// not just weight + balance point. Useful as a relative "does this feel heavier
// in the swing" indicator across models/weight classes, not an absolute physical spec.
const PIVOT_MM = 100;

let RACKETS = [];
const SELECTED_IDS = new Set();

function brandColorVar(brand) {
  return `var(${BRAND_COLOR_VAR[brand] || "--accent"})`;
}

function swingWeight(weightG, balanceMm) {
  if (weightG == null || balanceMm == null) return null;
  const weightKg = weightG / 1000;
  const armCm = (balanceMm - PIVOT_MM) / 10;
  return weightKg * armCm * armCm; // kg·cm²
}

// Flatten each racket's weight-class variants into individually plottable/listable items.
function getVariantItems(racket) {
  const variants = racket.variants && racket.variants.length ? racket.variants : [null];
  return variants.map(v => {
    const weightG = v ? v.weight_g : null;
    const balanceMm = v ? v.balance_point_mm : null;
    return {
      pointId: v ? `${racket.id}::${v.weight_class}` : racket.id,
      racket,
      variant: v,
      weightClass: v ? v.weight_class : null,
      weightG,
      balanceMm,
      balanceConfidence: v ? v.balance_confidence : null,
      sw: swingWeight(weightG, balanceMm)
    };
  });
}

function allVariantItems() {
  return RACKETS.flatMap(getVariantItems);
}

async function loadData() {
  const res = await fetch("data/rackets.json", { cache: "no-store" });
  RACKETS = await res.json();
  populateBrandFilter();
  renderMatrix(RACKETS);
  renderList();
}

function populateBrandFilter() {
  const panel = document.getElementById("brand-filter-panel");
  const brands = [...new Set(RACKETS.map(r => r.brand))].sort();
  panel.innerHTML = brands.map(b => `<label><input type="checkbox" value="${escapeHtml(b)}"> ${escapeHtml(b)}</label>`).join("");
}

function getCheckedValues(panelId) {
  return Array.from(document.querySelectorAll(`#${panelId} input:checked`)).map(el => el.value);
}

function updateSeriesFilterPanel() {
  const brands = getCheckedValues("brand-filter-panel");
  const panel = document.getElementById("series-filter-panel");
  const btn = document.getElementById("series-filter-btn");
  panel.innerHTML = "";
  panel.classList.remove("open");
  if (brands.length === 0) {
    btn.disabled = true;
    btn.textContent = "すべてのシリーズ ▾";
    btn.classList.remove("active");
    return;
  }
  btn.disabled = false;
  btn.textContent = "すべてのシリーズ ▾";
  btn.classList.remove("active");
  const seriesList = [...new Set(RACKETS.filter(r => brands.includes(r.brand)).map(r => r.series).filter(Boolean))].sort();
  panel.innerHTML = seriesList.map(s => `<label><input type="checkbox" value="${escapeHtml(s)}"> ${escapeHtml(s)}</label>`).join("");
}

function getFiltered() {
  const q = document.getElementById("search-input").value.trim().toLowerCase();
  const brands = getCheckedValues("brand-filter-panel");
  const seriesList = getCheckedValues("series-filter-panel");
  const balances = getCheckedValues("balance-filter-panel");
  const flexes = getCheckedValues("flex-filter-panel");
  return RACKETS.filter(r => {
    if (brands.length && !brands.includes(r.brand)) return false;
    if (seriesList.length && !seriesList.includes(r.series)) return false;
    if (balances.length && !balances.includes(r.head_balance)) return false;
    if (flexes.length && !flexes.includes(r.flex)) return false;
    if (q && !(`${r.brand} ${r.model}`.toLowerCase().includes(q))) return false;
    return true;
  });
}

function setupFilterDropdowns() {
  const groups = [
    { key: "brand", label: "すべてのブランド" },
    { key: "series", label: "すべてのシリーズ" },
    { key: "balance", label: "すべてのバランス" },
    { key: "flex", label: "すべての硬さ" }
  ];
  groups.forEach(({ key, label }) => {
    const btn = document.getElementById(`${key}-filter-btn`);
    const panel = document.getElementById(`${key}-filter-panel`);

    btn.addEventListener("click", e => {
      e.stopPropagation();
      if (btn.disabled) return;
      const willOpen = !panel.classList.contains("open");
      document.querySelectorAll(".filter-panel.open").forEach(p => p.classList.remove("open"));
      if (willOpen) panel.classList.add("open");
    });

    panel.addEventListener("change", () => {
      if (key === "brand") updateSeriesFilterPanel();
      const checked = getCheckedValues(`${key}-filter-panel`);
      btn.textContent = (checked.length ? `${label.replace("すべての", "")} (${checked.length}) ` : label) + " ▾";
      btn.classList.toggle("active", checked.length > 0);
      renderList();
    });
  });

  document.addEventListener("click", () => {
    document.querySelectorAll(".filter-panel.open").forEach(p => p.classList.remove("open"));
  });
}

function getMatrixRackets(filteredList) {
  if (SELECTED_IDS.size > 0) {
    return RACKETS.filter(r => SELECTED_IDS.has(r.id));
  }
  return filteredList;
}

function renderSelectionBar() {
  const bar = document.getElementById("selection-bar");
  if (!bar) return;
  if (SELECTED_IDS.size === 0) {
    bar.innerHTML = "";
    bar.classList.add("hidden");
    return;
  }
  bar.classList.remove("hidden");
  bar.innerHTML = `
    <span>${SELECTED_IDS.size}件を選択中(マトリクス図は選択したラケットのみ表示されます)</span>
    <button type="button" id="selection-clear-btn">選択を解除</button>
  `;
  document.getElementById("selection-clear-btn").addEventListener("click", () => {
    SELECTED_IDS.clear();
    renderList();
  });
}

const BRAND_ORDER = ["Li-Ning", "Yonex"]; // fixed priority order; any other brand falls back to alphabetical

function groupByBrandAndSeries(list) {
  const byBrand = {};
  for (const r of list) {
    const series = r.series || "その他";
    (byBrand[r.brand] ||= {});
    (byBrand[r.brand][series] ||= []).push(r);
  }
  const brands = Object.keys(byBrand).sort((a, b) => {
    const ai = BRAND_ORDER.indexOf(a), bi = BRAND_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  return brands.map(brand => ({
    brand,
    seriesGroups: Object.keys(byBrand[brand]).sort().map(series => ({ series, items: byBrand[brand][series] }))
  }));
}

function buildRacketCard(r, list) {
  const card = document.createElement("div");
  card.className = "racket-card" + (SELECTED_IDS.has(r.id) ? " selected" : "");
  const weightChips = (r.variants || []).map(v => {
    const sw = swingWeight(v.weight_g, v.balance_point_mm);
    return `<span class="tag weight-tag">${escapeHtml(v.weight_class)}${v.weight_g ? ` ${v.weight_g}g` : ""}${sw ? ` ・SW${sw.toFixed(1)}` : ""}</span>`;
  }).join("");
  card.innerHTML = `
    <label class="select-check" title="比較用に選択">
      <input type="checkbox" ${SELECTED_IDS.has(r.id) ? "checked" : ""}>
    </label>
    <div class="brand">${escapeHtml(r.brand)}</div>
    <div class="model">${escapeHtml(r.model)}</div>
    <div class="tag-row">
      <span class="tag balance-${cssEscape(r.head_balance)}">${escapeHtml(r.head_balance)}</span>
      <span class="tag">${escapeHtml(r.flex)}</span>
    </div>
    <div class="tag-row" style="margin-top:6px;">${weightChips}</div>
  `;
  card.querySelector(".select-check input").addEventListener("click", e => {
    e.stopPropagation();
    if (e.target.checked) SELECTED_IDS.add(r.id); else SELECTED_IDS.delete(r.id);
    card.classList.toggle("selected", e.target.checked);
    renderSelectionBar();
    renderMatrix(getMatrixRackets(list));
  });
  card.addEventListener("click", () => openDetail(r.id));
  return card;
}

function renderList() {
  const list = getFiltered();
  const grid = document.getElementById("racket-grid");
  grid.innerHTML = "";
  if (list.length === 0) {
    grid.innerHTML = '<p style="color:var(--text-muted)">該当するラケットがありません。</p>';
  } else {
    for (const { brand, seriesGroups } of groupByBrandAndSeries(list)) {
      const brandSection = document.createElement("div");
      brandSection.className = "brand-group";
      const brandTitle = document.createElement("h3");
      brandTitle.className = "brand-group-title";
      brandTitle.style.color = brandColorVar(brand);
      brandTitle.textContent = brand;
      brandSection.appendChild(brandTitle);

      for (const { series, items } of seriesGroups) {
        const seriesBlock = document.createElement("div");
        seriesBlock.className = "series-group";
        seriesBlock.innerHTML = `<h4 class="series-group-title">${escapeHtml(series)}</h4>`;
        const cardsWrap = document.createElement("div");
        cardsWrap.className = "racket-grid";
        for (const r of items) cardsWrap.appendChild(buildRacketCard(r, list));
        seriesBlock.appendChild(cardsWrap);
        brandSection.appendChild(seriesBlock);
      }
      grid.appendChild(brandSection);
    }
  }
  renderSelectionBar();
  renderMatrix(getMatrixRackets(list));
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
  const racketIds = new Set(rackets.map(r => r.id));
  const items = allVariantItems().filter(it => racketIds.has(it.racket.id) && FLEX_ORDER.includes(it.racket.flex) && it.sw !== null);

  const width = 680, height = 480;
  const margin = { top: 20, right: 24, bottom: 56, left: 56 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const cols = FLEX_ORDER.length;
  const colW = plotW / cols;

  // Y domain: continuous, based on computed swing weight (kg·cm²), padded and rounded to nice 5-unit steps
  const swValues = items.map(it => it.sw);
  const rawMin = swValues.length ? Math.min(...swValues) : 25;
  const rawMax = swValues.length ? Math.max(...swValues) : 45;
  const yMin = Math.max(0, Math.floor((rawMin - 3) / 5) * 5);
  const yMax = Math.ceil((rawMax + 3) / 5) * 5;
  const yScale = sw => margin.top + plotH * (1 - (sw - yMin) / (yMax - yMin));

  let svg = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" font-family="inherit">`;

  // vertical guide lines between flex columns
  for (let c = 0; c <= cols; c++) {
    const x = margin.left + c * colW;
    svg += `<line x1="${x}" y1="${margin.top}" x2="${x}" y2="${margin.top + plotH}" style="stroke:var(--border)" stroke-width="1" stroke-dasharray="${c === 0 || c === cols ? "0" : "3,3"}"/>`;
  }

  // horizontal swing-weight ticks every 5 units
  for (let sw = yMin; sw <= yMax; sw += 5) {
    const y = yScale(sw);
    svg += `<line x1="${margin.left}" y1="${y}" x2="${margin.left + plotW}" y2="${y}" style="stroke:var(--border)" stroke-width="1" stroke-opacity="0.5"/>`;
    svg += `<text x="${margin.left - 8}" y="${y + 3}" text-anchor="end" font-size="9" style="fill:var(--text-muted)">${sw}</text>`;
  }

  // column labels (flex, bottom)
  FLEX_ORDER.forEach((label, ci) => {
    const x = margin.left + ci * colW + colW / 2;
    svg += `<text x="${x}" y="${margin.top + plotH + 20}" text-anchor="middle" font-size="12" style="fill:var(--text-muted)">${escapeHtml(label)}</text>`;
  });
  svg += `<text x="${margin.left + plotW / 2}" y="${height - 4}" text-anchor="middle" font-size="12" font-weight="600" style="fill:var(--text)">硬さ (Flex) →</text>`;

  svg += `<text x="14" y="${margin.top + 6}" font-size="10" style="fill:var(--text-muted)">重い(振り応えあり)</text>`;
  svg += `<text x="14" y="${margin.top + plotH - 2}" font-size="10" style="fill:var(--text-muted)">軽い(振り抜き易い)</text>`;
  svg += `<text x="14" y="${margin.top + plotH / 2}" text-anchor="middle" font-size="12" font-weight="600" style="fill:var(--text)" transform="rotate(-90 14 ${margin.top + plotH / 2})">推定スイングウェイト(kg・cm²) ←→</text>`;

  // group by flex column, then resolve close-in-y collisions with left/right offsets
  const byCol = {};
  for (const it of items) {
    const ci = FLEX_ORDER.indexOf(it.racket.flex);
    (byCol[ci] ||= []).push(it);
  }

  // group by racket id within column, to draw a connecting line across its weight-class variants
  for (const ci in byCol) {
    const colCenterX = margin.left + Number(ci) * colW + colW / 2;
    const byRacket = {};
    for (const it of byCol[ci]) (byRacket[it.racket.id] ||= []).push(it);
    for (const rid in byRacket) {
      const vitems = byRacket[rid].sort((a, b) => a.sw - b.sw);
      if (vitems.length > 1) {
        const y1 = yScale(vitems[0].sw), y2 = yScale(vitems[vitems.length - 1].sw);
        svg += `<line x1="${colCenterX}" y1="${y1}" x2="${colCenterX}" y2="${y2}" style="stroke:${brandColorVar(vitems[0].racket.brand)}" stroke-width="2" stroke-opacity="0.35"/>`;
      }
    }

    const group = byCol[ci].slice().sort((a, b) => a.sw - b.sw);
    const placed = [];
    const minGap = 20;
    group.forEach(it => {
      const py = yScale(it.sw);
      let side = 0;
      const overlapCount = placed.filter(p => Math.abs(p.py - py) < minGap).length;
      if (overlapCount > 0) side = Math.ceil(overlapCount / 2) * (overlapCount % 2 === 1 ? 1 : -1);
      const px = colCenterX + side * 16;
      placed.push({ py });

      const conf = it.balanceConfidence;
      const color = brandColorVar(it.racket.brand);
      const dash = conf === "measured" ? "" : `stroke-dasharray="3,2"`;
      const fillOpacity = conf === "unknown" ? "0.15" : "0.85";
      const shortName = it.racket.short_label || it.racket.model;
      const label = it.weightClass ? `${shortName} ${it.weightClass}` : shortName;

      svg += `<g class="matrix-point" data-id="${it.pointId}" transform="translate(${px},${py})">
        <circle r="6" style="fill:${color};stroke:${color}" fill-opacity="${fillOpacity}" stroke-width="1.5" ${dash}/>
        <text x="0" y="17" text-anchor="middle" font-size="9" style="fill:var(--text)">${escapeHtml(label)}</text>
      </g>`;
    });
  }

  svg += `</svg>`;
  container.innerHTML = svg;

  const totalItems = rackets.flatMap(getVariantItems).length;
  const skipped = totalItems - items.length;
  const legend = document.getElementById("matrix-legend");
  if (legend) {
    legend.innerHTML = `
      <span class="legend-item"><span class="legend-dot solid"></span>バランス実測値ベース</span>
      <span class="legend-item"><span class="legend-dot dashed"></span>バランス推定値</span>
      <span class="legend-item"><span class="legend-dot hollow"></span>バランスデータなし(概算)</span>
      <span class="legend-item"><span class="legend-line"></span>同一モデルの重量クラス違い</span>
      ${skipped > 0 ? `<span class="legend-item">※${skipped}件は算出に必要なデータ不足のため図に非表示</span>` : ""}
    `;
  }

  container.querySelectorAll(".matrix-point").forEach(el => {
    el.addEventListener("click", () => openDetail(el.dataset.id.split("::")[0]));
  });
}

function productCodeCellHtml(r) {
  if (!r.product_code) {
    return `不明${r.product_code_note ? ` <span style="color:var(--text-muted);font-size:0.85em;">(${escapeHtml(r.product_code_note)})</span>` : ""}`;
  }
  return `${escapeHtml(r.product_code)}${r.product_code_note ? `<div style="font-size:0.8em;color:var(--text-muted);margin-top:2px;">${escapeHtml(r.product_code_note)}</div>` : ""}`;
}

function variantsTableHtml(r) {
  if (!r.variants || !r.variants.length) return "";
  const rows = r.variants.map(v => {
    const sw = swingWeight(v.weight_g, v.balance_point_mm);
    const confLabel = CONFIDENCE_LABEL[v.balance_confidence] || "";
    return `<tr>
      <td>${escapeHtml(v.weight_class)}</td>
      <td>${v.weight_g != null ? v.weight_g + " g" : "不明"}${v.weight_confidence === "estimated" ? " <span style=\"color:var(--text-muted);font-size:0.85em;\">(推定)</span>" : ""}</td>
      <td>${v.grip_size ? escapeHtml(v.grip_size) : "―"}</td>
      <td>${v.shaft_diameter_mm != null ? v.shaft_diameter_mm + " mm" : "―"}</td>
      <td>${v.balance_point_mm != null ? v.balance_point_mm + " mm" : "不明"}${confLabel ? ` <span style="color:var(--text-muted);font-size:0.85em;">(${escapeHtml(confLabel)})</span>` : ""}</td>
      <td>${sw != null ? sw.toFixed(1) : "―"}</td>
    </tr>`;
  }).join("");
  return `
    <div class="review-block">
      <h4>重量クラス別スペック</h4>
      <table class="spec-table variant-table">
        <tr><th>クラス</th><th>重量</th><th>グリップ</th><th>シャフト径</th><th>バランス</th><th>推定SW(kg・cm²)</th></tr>
        ${rows}
      </table>
      <p style="font-size:0.78em;color:var(--text-muted);margin-top:4px;">
        SW(スイングウェイト)は重量×バランス位置(支点=グリップエンドから${PIVOT_MM}mm)から算出した目安の指数で、実測の慣性モーメントではありません。
      </p>
    </div>`;
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
      <tr><th>品番</th><td>${productCodeCellHtml(r)}</td></tr>
      <tr><th>ヘッドバランス</th><td>${escapeHtml(r.head_balance)}</td></tr>
      <tr><th>硬さ (Flex)</th><td>${escapeHtml(r.flex)}</td></tr>
      <tr><th>シャフト素材</th><td>${escapeHtml(r.shaft_material) || "不明"}</td></tr>
      <tr><th>フレーム素材</th><td>${escapeHtml(r.frame_material) || "不明"}</td></tr>
      <tr><th>推奨テンション</th><td>${escapeHtml(r.string_tension_lbs) || "不明"}</td></tr>
      <tr><th>参考価格</th><td>${r.price_jpy_approx ? "¥" + Number(r.price_jpy_approx).toLocaleString() + " (税抜目安)" : "不明"}${r.price_note ? `<div style="font-size:0.8em;color:var(--text-muted);margin-top:2px;">${escapeHtml(r.price_note)}</div>` : ""}</td></tr>
    </table>
    ${variantsTableHtml(r)}
    ${r.balance_note ? `<p style="font-size:0.8em;color:var(--text-muted);">${escapeHtml(r.balance_note)}</p>` : ""}
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

document.getElementById("search-input").addEventListener("input", renderList);
setupFilterDropdowns();

loadData();
