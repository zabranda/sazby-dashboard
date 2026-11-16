const DRIVERS = [
  { id: "cnb_repo", file: "data/cnb_repo.csv", group: "Česko", title: "2T repo sazba ČNB", unit: "pct", step: true, explain: "Krátký konec korunové křivky se od 2T repo sazby odvíjí přímo. Další měnověpolitická jednání jsou 17. 12. 2026 a 4. 2. 2027." },
  { id: "cz_cpi", file: "data/cz_cpi.csv", group: "Česko", title: "Inflace ČSÚ, meziročně", unit: "pct", explain: "Vyšší inflace zvedá očekávání, že ČNB sazby podrží nebo zvýší, a tím i IRS.", target: 2, band: [1, 3] },
  { id: "cz_bond_3y", file: "data/cz_bond_3y.csv", group: "Česko", title: "Výnos 3letého státního dluhopisu", unit: "pct", explain: "Výnos státního dluhopisu je sesterská korunová sazba; IRS se od něj liší o swapové rozpětí." },
  { id: "eur_czk", file: "data/cnb_fx.csv", column: "eur_czk", group: "Česko", title: "Fixing EUR/CZK", unit: "czk", explain: "Slabší koruna může tlačit ČNB k přísnějším sazbám, silnější koruna otevírá prostor pro nižší." },
  { id: "pribor_3m", file: "data/pribor_3m.csv", group: "Česko", title: "PRIBOR 3M", unit: "pct", explain: "Tříměsíční PRIBOR je sazba, od které se 3Y IRS typicky odvíjí na krátkém konci." },
  { id: "ecb_deposit", file: "data/ecb_deposit.csv", group: "Eurozóna", title: "Depozitní sazba ECB", unit: "pct", step: true, explain: "Eurové sazby táhnou korunové přes úrokový diferenciál a kurz." },
  { id: "hicp_ea", file: "data/hicp_ea.csv", group: "Eurozóna", title: "HICP eurozóny, meziročně", unit: "pct", explain: "Inflace v eurozóně řídí očekávání o sazbách ECB a ty se přelévají do CZK IRS.", target: 2 },
  { id: "eur_2y", file: "data/eur_2y.csv", group: "Eurozóna", title: "2Y eurová AAA sazba", unit: "pct", explain: "Dvouletá sazba eurové AAA křivky ECB je nejbližší veřejný protějšek krátkého konce. Není to přímo německý Schatz ani EUR swap." },
  { id: "fed_funds", file: "data/fed_funds.csv", group: "USA", title: "Fed funds, horní hranice", unit: "pct", step: true, explain: "Fed působí na CZK IRS nepřímo, přes eurové sazby a globální chuť riskovat." },
  { id: "us_cpi", file: "data/us_cpi.csv", group: "USA", title: "Inflace USA, meziročně", unit: "pct", explain: "Americká inflace posouvá očekávání o Fedu a globální výnosy, odtud nepřímo i korunu.", target: 2 },
  { id: "ust_2y", file: "data/ust_2y.csv", group: "USA", title: "US Treasury 2Y", unit: "pct", explain: "Dvouletý americký výnos nese očekávané sazby Fedu a přelévá se do Evropy." },
  { id: "ust_10y", file: "data/ust_10y.csv", group: "USA", title: "US Treasury 10Y", unit: "pct", explain: "Desetiletý výnos nese globální termínovou prémii a sentiment, který hýbe i delšími CZK sazbami." },
  { id: "eur_usd", file: "data/eurusd.csv", group: "Globální", title: "EUR/USD", unit: "fx", explain: "Kurz eura k dolaru mění importované ceny i relativní tah dolarových a eurových sazeb." },
  { id: "brent", file: "data/brent.csv", group: "Globální", title: "Ropa Brent", unit: "usd", explain: "Ropa živí inflační očekávání v Česku i v eurozóně, proto se promítá do sazeb." },
];

const GROUPS = ["Česko", "Eurozóna", "USA", "Globální"];
const nf = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf4 = new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 4 });
const charts = [];
const state = { range: "2R", marketRange: "1R", marketCharts: {} };

function esc(value) {
  return String(value ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
}
function num(value) {
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}
function pct(value, digits = 2) {
  const format = new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return format.format(value) + " %";
}
function signed(value, suffix, digits = 1) {
  if (value == null || Number.isNaN(value)) return "—";
  const format = digits === 2 ? nf : nf1;
  const body = format.format(Math.abs(value));
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return sign + body + suffix;
}
function cls(value) { return value > 0 ? "up" : value < 0 ? "down" : ""; }
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cur += '"'; i++; }
        else quoted = false;
      } else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); if (row.some((cell) => cell !== "")) rows.push(row); }
  const header = rows.shift() || [];
  return rows.map((cells) => Object.fromEntries(header.map((key, index) => [key, cells[index] ?? ""])));
}
async function load(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(path + " " + response.status);
  return response.text();
}
function seriesFrom(rows, column = "value") {
  return rows.map((row) => ({
    date: row.date || row.date_effective,
    value: num(row[column]),
    quality: row.quality || "",
    source: row.source || "",
  })).filter((point) => point.date && point.value != null).sort((a, b) => a.date.localeCompare(b.date));
}
function onOrBefore(series, iso) {
  let found = null;
  for (const point of series) {
    if (point.date <= iso) found = point;
    else break;
  }
  return found;
}
function shift(iso, days) {
  const date = new Date(iso + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}
function change(series, days) {
  if (!series.length) return null;
  const last = series[series.length - 1];
  const past = onOrBefore(series, shift(last.date, days));
  if (!past || past.date === last.date) return null;
  return last.value - past.value;
}
function cutoff(lastDate, range) {
  const days = { "3M": 92, "6M": 183, "1R": 366, "2R": 731 }[range];
  return days ? shift(lastDate, days) : "1900-01-01";
}
function inForce(steps, iso) {
  return onOrBefore(steps, iso);
}
function daysUntil(iso) {
  const target = new Date(iso + "T00:00:00+01:00");
  const now = new Date();
  return Math.ceil((target - now) / 86400000);
}
function chip(days) {
  if (days > 1) return "za " + days + " dní";
  if (days === 1) return "zítra";
  if (days === 0) return "dnes";
  return "před " + Math.abs(days) + " dny";
}
function unitOf(id) {
  return DRIVERS.find((driver) => driver.id === id)?.unit || "pct";
}
function formatValue(value, unit) {
  if (value == null) return "—";
  if (unit === "pct") return pct(value);
  if (unit === "czk") return nf.format(value) + " Kč";
  if (unit === "usd") return nf.format(value) + " USD";
  return nf4.format(value);
}
function formatDelta(value, unit) {
  if (value == null) return "—";
  if (unit === "pct") return signed(value, " p. b.");
  if (unit === "czk") return signed(value, " Kč", 2);
  if (unit === "usd") return signed(value, " USD");
  return signed(value, "", 2);
}

function baseOption() {
  return {
    animation: false,
    textStyle: { fontFamily: "Source Sans 3, sans-serif" },
    grid: { left: 48, right: 56, top: 32, bottom: 36 },
    tooltip: { trigger: "axis" },
  };
}

function fx3(value) {
  return new Intl.NumberFormat("cs-CZ", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(value);
}
function latestBanks() {
  const latest = new Map();
  for (const row of state.banks) {
    const prev = latest.get(row.bank);
    if (!prev || (row.date_effective || "") > (prev.date_effective || "")) latest.set(row.bank, row);
  }
  const rows = [...latest.values()];
  const rank = (bank) => (/raiffeisen/i.test(bank) ? 0 : /air bank/i.test(bank) ? 1 : 2);
  rows.sort((a, b) => rank(a.bank) - rank(b.bank) || num(a.rate_pct) - num(b.rate_pct));
  return rows;
}
function tile(card) {
  return `<article class="tile ${card.tone || ""}"><div class="label">${esc(card.label)}</div><div class="value">${card.value}</div><div class="sub">${card.sub || ""}</div></article>`;
}
function renderTiles() {
  const irs = state.irs3;
  const last = irs[irs.length - 1];
  const week = change(irs, 7);
  const month = change(irs, 30);
  const air = inForce(state.air, last ? last.date : "9999-12-31");
  const active = state.airActive;
  const spreadBp = last && air ? (air.value - last.value) * 100 : null;
  const fx = state.fx[state.fx.length - 1];
  const eurusd = (state.series.eur_usd || []).at(-1);
  document.getElementById("bank-tiles").innerHTML = latestBanks().map((row) => {
    const rate = num(row.rate_pct);
    const airBank = /air bank/i.test(row.bank);
    const sub = airBank && active != null ? `aktivní klienti ${pct(active)}` : esc(row.note || "");
    return tile({ label: row.bank, value: rate == null ? "—" : pct(rate), sub });
  }).join("");
  const market = [
    { label: "3Y CZK IRS", value: last ? pct(last.value, 3) : "—", sub: `týden ${week == null ? "—" : `<span class="${cls(week)}">${signed(week * 100, " bp")}</span>`}<br>měsíc ${month == null ? "—" : `<span class="${cls(month)}">${signed(month * 100, " bp")}</span>`}` },
  ];
  if (fx) {
    market.push({ label: "EUR/CZK", value: fx3(fx.eur), sub: fx.date.split("-").reverse().join(". ") });
    market.push({ label: "USD/CZK", value: fx3(fx.usd), sub: "fixing ČNB" });
  }
  if (eurusd) market.push({ label: "EUR/USD", value: nf4.format(eurusd.value), sub: eurusd.date.split("-").reverse().join(". ") });
  document.getElementById("market-tiles").innerHTML = market.map(tile).join("");
  const flowIrs = document.getElementById("flow-irs");
  const flowSpread = document.getElementById("flow-spread");
  if (last) flowIrs.textContent = pct(last.value, 3) + " ke dni " + last.date.split("-").reverse().join(". ");
  if (spreadBp != null) flowSpread.textContent = `ceník ${pct(air.value)}, spread ${signed(spreadBp, " bp", 0)}`;
}
function renderMarket() {
  const root = document.getElementById("market-charts");
  if (!window.echarts || !state.irs3.length) return;
  const specs = [
    { id: "irs", name: "3Y CZK IRS", points: state.irs3, color: "#173848" },
    { id: "eur", name: "EUR/CZK", points: state.fx.map((point) => ({ date: point.date, value: point.eur })), color: "#0e6a60" },
    { id: "usd", name: "USD/CZK", points: state.fx.map((point) => ({ date: point.date, value: point.usd })), color: "#9a6208" },
    { id: "eurusd", name: "EUR/USD", points: state.series.eur_usd || [], color: "#b24a2c" },
  ].filter((item) => item.points.length);
  if (!root.dataset.ready) {
    root.innerHTML = specs.map((item) => `<div class="market-cell"><h3>${esc(item.name)}</h3><div class="plot" id="mkt-${item.id}"></div></div>`).join("");
    root.dataset.ready = "1";
  }
  const from = cutoff(state.irs3[state.irs3.length - 1].date, state.marketRange);
  for (const item of specs) {
    const el = document.getElementById("mkt-" + item.id);
    if (!el) continue;
    const points = item.points.filter((point) => point.date >= from);
    const chart = state.marketCharts[item.id] || echarts.init(el);
    state.marketCharts[item.id] = chart;
    chart.setOption({
      animation: false,
      grid: { left: 52, right: 12, top: 12, bottom: 24 },
      tooltip: { trigger: "axis" },
      xAxis: { type: "time", axisLabel: { fontSize: 10 } },
      yAxis: { type: "value", scale: true, axisLabel: { fontSize: 10, formatter: (value) => nf.format(value) } },
      series: [line(item.name, points, { color: item.color, lineStyle: { width: 1.8 }, showSymbol: false })],
    }, true);
    if (!charts.includes(chart)) charts.push(chart);
  }
}

function line(name, points, extra = {}) {
  return {
    name,
    type: "line",
    showSymbol: points.length < 8,
    data: points.map((point) => [point.date, point.value]),
    ...extra,
  };
}

function renderMain() {
  const el = document.getElementById("chart-main");
  const last = state.irs3[state.irs3.length - 1];
  if (!last || !window.echarts) { el.textContent = "Graf se nepodařilo vykreslit."; return; }
  const from = cutoff(last.date, state.range);
  const irs = state.irs3.filter((point) => point.date >= from);
  const before = inForce(state.air, from);
  const air = state.air.filter((point) => point.date >= from);
  if (before && (!air.length || air[0].date !== before.date)) air.unshift(before);
  if (air.length) air.push({ date: last.date, value: air[air.length - 1].value });
  const series = [
    line("3Y IRS", irs, {
      color: "#173848",
      lineStyle: { width: 2.4 },
      markArea: {
        silent: true,
        itemStyle: { color: "rgba(178, 74, 44, 0.12)" },
        label: { color: "#8a3b24", fontSize: 11 },
        data: [[{ yAxis: 5.1, name: "pásmo, kde Air Bank pravděpodobně zdraží" }, { yAxis: 5.2 }]],
      },
      markLine: {
        silent: true,
        symbol: "none",
        lineStyle: { type: "dashed", color: "#6d645b" },
        label: { formatter: "Raiffeisenbank 5,45 %", color: "#6d645b" },
        data: [{ yAxis: 5.45 }],
      },
    }),
    line("Air Bank 3Y", air, {
      color: "#b24a2c",
      step: "end",
      lineStyle: { width: 2 },
      markPoint: {
        symbol: "circle",
        symbolSize: 8,
        itemStyle: { color: "#b24a2c" },
        label: {
          formatter: (item) => {
            const date = item.data && item.data.date;
            if (!date) return "";
            return Number(date.slice(8)) + ". " + Number(date.slice(5, 7)) + ".";
          },
          fontSize: 10,
          color: "#6d645b",
        },
        data: state.air.filter((point) => point.date >= from && point.date <= last.date).map((point) => ({ coord: [point.date, point.value], date: point.date, value: point.value })),
      },
    }),
  ];
  if (document.getElementById("show-1y").checked) series.push(line("1Y IRS", state.irs1.filter((p) => p.date >= from), { color: "#0e6a60" }));
  if (document.getElementById("show-5y").checked) series.push(line("5Y IRS", state.irs5.filter((p) => p.date >= from), { color: "#9a6208" }));
  const overlayId = document.getElementById("overlay").value;
  const axes = [{ type: "value", scale: true, axisLabel: { formatter: (v) => nf.format(v) } }];
  if (overlayId) {
    const driver = DRIVERS.find((item) => item.id === overlayId);
    const points = (state.series[overlayId] || []).filter((point) => point.date >= from);
    series.push(line(driver.title, points, { yAxisIndex: 1, color: "#5b4b8a", step: driver.step ? "end" : false, lineStyle: { type: "dotted", width: 2 } }));
    axes.push({ type: "value", scale: true, splitLine: { show: false }, axisLabel: { formatter: (v) => nf.format(v) } });
  }
  const official = irs.filter((point) => point.quality === "official");
  if (official.length) {
    series.push({
      name: "staženo z Patrie",
      type: "scatter",
      symbolSize: 9,
      color: "#173848",
      data: official.map((point) => [point.date, point.value]),
    });
  }
  const chart = state.mainChart || echarts.init(el);
  state.mainChart = chart;
  chart.setOption({
    ...baseOption(),
    legend: { top: 0, textStyle: { fontSize: 12 } },
    xAxis: { type: "time" },
    yAxis: axes,
    series,
  }, true);
  if (!charts.includes(chart)) charts.push(chart);
}

function renderSpread() {
  const el = document.getElementById("chart-spread");
  const last = state.irs3[state.irs3.length - 1];
  if (!last || !window.echarts) return;
  const from = cutoff(last.date, state.range);
  const points = state.irs3.filter((point) => point.date >= from).map((point) => {
    const air = inForce(state.air, point.date);
    return air ? { date: point.date, value: (air.value - point.value) * 100 } : null;
  }).filter(Boolean);
  const chart = state.spreadChart || echarts.init(el);
  state.spreadChart = chart;
  chart.setOption({
    ...baseOption(),
    xAxis: { type: "time" },
    yAxis: { type: "value", scale: true, axisLabel: { formatter: (v) => nf.format(v) } },
    series: [line("Air Bank − IRS", points, {
      color: "#b24a2c",
      markLine: {
        silent: true,
        symbol: "none",
        lineStyle: { type: "dashed", color: "#173848" },
        label: { formatter: "40 bp", position: "insideEndTop" },
        data: [{ yAxis: 40 }],
      },
    })],
  }, true);
  if (!charts.includes(chart)) charts.push(chart);
}

function driverMeta(id) {
  return state.influence.drivers.find((item) => item.id === id) || {};
}

function renderInfluence() {
  const drivers = state.influence.drivers || [];
  const ranked = (state.influence.ranking || []).map((id) => driverMeta(id)).filter((item) => item.corr != null);
  const el = document.getElementById("chart-rank");
  if (window.echarts && ranked.length) {
    const chart = state.rankChart || echarts.init(el);
    state.rankChart = chart;
    const labels = ranked.map((item) => DRIVERS.find((driver) => driver.id === item.id)?.title || item.id).reverse();
    const values = ranked.map((item) => item.corr).reverse();
    chart.setOption({
      ...baseOption(),
      grid: { left: 170, right: 24, top: 10, bottom: 28 },
      xAxis: { type: "value", min: -1, max: 1, axisLabel: { formatter: (v) => nf.format(v) } },
      yAxis: { type: "category", data: labels },
      series: [{
        type: "bar",
        data: values.map((value) => ({ value, itemStyle: { color: value >= 0 ? "#0e6a60" : "#b24a2c" } })),
      }],
    }, true);
    if (!charts.includes(chart)) charts.push(chart);
  }
  const body = document.querySelector("#rank-table tbody");
  const ordered = [...ranked, ...drivers.filter((item) => item.corr == null)];
  body.innerHTML = ordered.map((item) => {
    const title = DRIVERS.find((driver) => driver.id === item.id)?.title || item.id;
    const unit = unitOf(item.id);
    const fresh = item.fresh === false ? " · řada není čerstvá" : "";
    return `<tr>
      <td>${esc(title)}</td>
      <td class="num">${item.corr == null ? "—" : nf.format(item.corr)}</td>
      <td class="num">${item.r2 == null ? "—" : nf.format(item.r2)}</td>
      <td>${item.impact_bp == null ? "—" : esc(item.impact_name) + " ~ " + signed(item.impact_bp, " bp")}</td>
      <td class="num">${formatDelta(item.change_1m, unit)}</td>
      <td class="num">${item.implied_irs_bp == null ? "—" : signed(item.implied_irs_bp, " bp")}</td>
      <td>${esc(item.verdict || "—")}${esc(fresh)}<div class="warn">${esc(item.confidence || "")}</div></td>
      <td>${spark(item.rolling)}</td>
    </tr>`;
  }).join("");
}

function spark(points) {
  if (!points || points.length < 2) return "";
  const width = 92;
  const height = 28;
  const values = points.map((point) => point.corr);
  const min = Math.min(...values, -1);
  const max = Math.max(...values, 1);
  const span = max - min || 1;
  const coords = values.map((value, index) => {
    const x = 2 + (index / (values.length - 1)) * (width - 4);
    const y = height - 2 - ((value - min) / span) * (height - 4);
    return x.toFixed(1) + "," + y.toFixed(1);
  }).join(" ");
  return `<svg class="spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true"><polyline fill="none" stroke="#173848" stroke-width="1.4" points="${coords}"/></svg>`;
}

function renderImplication() {
  const impl = state.influence.implication || {};
  const used = impl.used || [];
  const items = used.map((id) => driverMeta(id)).filter((item) => item.implied_irs_bp != null);
  const sum = impl.sum_irs_bp;
  const bank = impl.sum_bank_bp;
  const pass = sum < 0 ? "40 %" : "62,5 %";
  const list = items.length ? `<ul class="impl-list">${items.map((item) => {
    const title = DRIVERS.find((driver) => driver.id === item.id)?.title || item.id;
    return `<li><span>${esc(title)}</span><span>${formatDelta(item.change_1m, unitOf(item.id))} → ${signed(item.implied_irs_bp, " bp")} IRS</span></li>`;
  }).join("")}</ul>` : "<p>Z čerstvých řad zatím není dost změn pro přepočet.</p>";
  document.getElementById("implication").innerHTML = list +
    `<div class="impl-sum"><div>Součet dílčích odhadů na 3Y IRS</div><b>${sum == null ? "—" : signed(sum, " bp")}</b>
    <div>a z toho do ceníku hypotéky přibližně ${bank == null ? "—" : signed(bank, " bp")} při přenosu ${pass}.</div></div>
    <p class="warn">Součet není model: faktory se překrývají, historie IRS před živými daty je přibližná a do součtu vstupují jen řady, které nejsou starší než pár týdnů. U poklesu se počítá přenos 40 %, u růstu 62,5 %.</p>`;
}

function influenceShares() {
  const items = (state.influence.drivers || []).filter((item) => item.corr != null && Number.isFinite(item.corr));
  const raw = items.map((item) => Math.abs(item.corr));
  const total = raw.reduce((sum, value) => sum + value, 0) || 1;
  const exact = raw.map((value) => (value / total) * 100);
  const floors = exact.map((value) => Math.floor(value));
  let left = 100 - floors.reduce((sum, value) => sum + value, 0);
  exact.map((value, index) => ({ index, frac: value - floors[index] }))
    .sort((a, b) => b.frac - a.frac)
    .slice(0, left)
    .forEach((item) => { floors[item.index] += 1; });
  const shares = {};
  items.forEach((item, index) => {
    shares[item.id] = { pct: floors[index], sign: item.corr >= 0 ? 1 : -1 };
  });
  return shares;
}
function renderDrivers() {
  const root = document.getElementById("drivers");
  const select = document.getElementById("overlay");
  const shares = influenceShares();
  select.innerHTML = `<option value="">žádný</option>` + DRIVERS.filter((driver) => (state.series[driver.id] || []).length)
    .map((driver) => `<option value="${driver.id}">${esc(driver.title)}</option>`).join("");
  root.innerHTML = GROUPS.map((group) => {
    const cards = DRIVERS.filter((driver) => driver.group === group && (state.series[driver.id] || []).length).map((driver) => {
      const points = state.series[driver.id] || [];
      const last = points[points.length - 1];
      const delta = change(points, 30);
      const share = shares[driver.id];
      const shareHtml = share ? `<div class="share"><b class="${share.sign < 0 ? "down" : "up"}">${share.sign < 0 ? "−" : "+"} vliv ${share.pct} %</b><span class="share-track"><span class="share-fill ${share.sign < 0 ? "neg" : ""}" style="width:${share.pct}%"></span></span></div>` : "";
      return `<article class="mini">
        <header><div><strong>${esc(driver.title)}</strong><div class="label">${last.date.split("-").reverse().join(". ")}</div></div>
        <div class="num">${formatValue(last.value, driver.unit)} <span class="${cls(delta)}">${formatDelta(delta, driver.unit)}</span></div></header>
        ${shareHtml}
        <p>${esc(driver.explain)}</p>
        <div class="plot" id="mini-${driver.id}"></div>
      </article>`;
    }).join("");
    if (!cards) return "";
    return `<section class="group"><h3><span></span>${esc(group)}</h3><div class="minis">${cards}</div></section>`;
  }).join("");
  if (!window.echarts) return;
  for (const driver of DRIVERS) {
    const el = document.getElementById("mini-" + driver.id);
    const points = state.series[driver.id] || [];
    if (!el || !points.length) continue;
    const shown = points.filter((point) => point.date >= "2024-01-01");
    const seed = shown.length && shown[0].date !== points[0].date ? inForce(points, "2024-01-01") : null;
    const data = seed && shown[0] && seed.date !== shown[0].date ? [seed, ...shown] : (shown.length ? shown : points);
    const chart = echarts.init(el);
    const series = line(driver.title, data, {
      color: "#173848",
      step: driver.step ? "end" : false,
      lineStyle: { width: 1.6 },
      markLine: driver.target == null ? undefined : {
        silent: true, symbol: "none",
        lineStyle: { type: "dashed", color: "#0e6a60" },
        label: { formatter: "cíl " + nf.format(driver.target) + " %", fontSize: 10 },
        data: [{ yAxis: driver.target }],
      },
      markArea: driver.band ? {
        silent: true,
        itemStyle: { color: "rgba(14, 106, 96, 0.10)" },
        data: [[{ yAxis: driver.band[0] }, { yAxis: driver.band[1] }]],
      } : undefined,
    });
    chart.setOption({
      animation: false,
      grid: { left: 36, right: 8, top: 12, bottom: 22 },
      xAxis: { type: "time", axisLabel: { fontSize: 10 } },
      yAxis: { type: "value", scale: !driver.band, axisLabel: { fontSize: 10, formatter: (v) => nf.format(v) }, splitLine: { show: false } },
      series: [series],
      tooltip: { trigger: "axis" },
    }, true);
    charts.push(chart);
  }
}

function renderBanks() {
  const latest = new Map();
  for (const row of state.banks) {
    const prev = latest.get(row.bank);
    if (!prev || (row.date_effective || "") > (prev.date_effective || "")) latest.set(row.bank, row);
  }
  const rows = [...latest.values()].sort((a, b) => num(a.rate_pct) - num(b.rate_pct));
  document.querySelector("#banks tbody").innerHTML = rows.map((row) => {
    const rate = num(row.rate_pct);
    const diff = rate == null ? null : rate - state.rb;
    const bench = /raiffeisen/i.test(row.bank);
    return `<tr class="${bench ? "bench" : ""}">
      <td>${esc(row.bank)}</td>
      <td class="num">${rate == null ? "—" : pct(rate)}</td>
      <td class="num ${cls(diff)}">${diff == null ? "—" : signed(diff, " p. b.", 2)}</td>
      <td>${esc(row.note || "")}</td>
      <td>${esc((row.date_effective || "").split("-").reverse().join(". "))}</td>
    </tr>`;
  }).join("");
}

function renderStatus() {
  const when = state.meta.updated_at ? new Date(state.meta.updated_at) : null;
  const node = document.getElementById("updated");
  if (!node) return;
  node.textContent = when
    ? new Intl.DateTimeFormat("cs-CZ", { timeZone: "Europe/Prague", dateStyle: "medium", timeStyle: "short" }).format(when)
    : "—";
  node.setAttribute("datetime", state.meta.updated_at || "");
}

function bind() {
  document.getElementById("ranges").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    state.range = button.dataset.range;
    for (const item of document.querySelectorAll("#ranges button")) item.classList.toggle("active", item === button);
    renderMain();
    renderSpread();
  });
  document.getElementById("market-ranges").addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    state.marketRange = button.dataset.range;
    for (const item of document.querySelectorAll("#market-ranges button")) item.classList.toggle("active", item === button);
    renderMarket();
  });
  document.getElementById("show-1y").addEventListener("change", renderMain);
  document.getElementById("show-5y").addEventListener("change", renderMain);
  document.getElementById("overlay").addEventListener("change", renderMain);
  window.addEventListener("resize", () => charts.forEach((chart) => chart.resize()));
}

async function main() {
  document.getElementById("chip-cnb").textContent = chip(daysUntil("2026-12-17"));
  document.getElementById("chip-feb").textContent = chip(daysUntil("2027-02-01"));
  const [metaText, influenceText, irs3Text, irs1Text, irs5Text, fxText, airText, bankText] = await Promise.all([
    load("data/meta.json"), load("data/influence.json"), load("data/irs_3y.csv"), load("data/irs_1y.csv"),
    load("data/irs_5y.csv"), load("data/cnb_fx.csv"), load("data/airbank_3y.csv"), load("data/bank_rates.csv"),
  ]);
  state.meta = JSON.parse(metaText);
  state.influence = JSON.parse(influenceText);
  state.irs3 = seriesFrom(parseCsv(irs3Text));
  state.irs1 = seriesFrom(parseCsv(irs1Text));
  state.irs5 = seriesFrom(parseCsv(irs5Text));
  state.fx = parseCsv(fxText).map((row) => ({ date: row.date, eur: num(row.eur_czk), usd: num(row.usd_czk) })).filter((row) => row.eur && row.usd);
  const airRows = parseCsv(airText);
  state.air = airRows.map((row) => ({ date: row.date_effective, value: num(row.rate_pct) })).filter((row) => row.value != null);
  const latestAir = airRows[airRows.length - 1] || {};
  state.airActive = num(latestAir.active_rate_pct);
  state.banks = parseCsv(bankText);
  const rb = state.banks.find((row) => /raiffeisen/i.test(row.bank));
  state.rb = rb ? num(rb.rate_pct) : 5.45;
  state.series = {};
  state.missing = {};
  await Promise.all(DRIVERS.map(async (driver) => {
    try {
      const rows = parseCsv(await load(driver.file));
      state.series[driver.id] = driver.column === "eur_czk"
        ? rows.map((row) => ({ date: row.date, value: num(row.eur_czk) })).filter((point) => point.value != null)
        : seriesFrom(rows);
      if (!state.series[driver.id].length) state.missing[driver.id] = "V souboru zatím nejsou hodnoty.";
    } catch (error) {
      state.series[driver.id] = [];
      state.missing[driver.id] = driver.id === "cz_bond_3y"
        ? "Automatický zdroj bez registrace není. Řadu lze doplnit do data/cz_bond_3y.csv."
        : "Soubor se nepodařilo načíst.";
    }
  }));
  const official = state.irs3.find((point) => point.quality === "official");
  if (official) {
    document.getElementById("irs-note").textContent =
      `Body do ${official.date.split("-").reverse().join(". ")} jsou přibližný odečet z grafu Patria (±3 bp). Od tohoto data je střed nákup/prodej stažený ze stránky.`;
  }
  renderTiles();
  renderMarket();
  renderMain();
  renderSpread();
  renderInfluence();
  renderDrivers();
  renderBanks();
  renderStatus();
  bind();
}

main().catch((error) => {
  console.error(error);
  document.querySelector("h1").insertAdjacentHTML("afterend", `<p class="warn">Data se nepodařilo načíst: ${esc(error.message)}</p>`);
});
