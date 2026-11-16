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
  if (value == null) return null;
  const text = String(value).trim().replace(/\s/g, "").replace(",", ".");
  if (text === "" || text.toLowerCase() === "n/a") return null;
  const parsed = Number(text);
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

const AIRBANK_TRIGGER_BP = 15;
function daysBetween(from, to) {
  return Math.round((new Date(to + "T00:00:00Z") - new Date(from + "T00:00:00Z")) / 86400000);
}
function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function analyzeAirbank() {
  const rows = (state.airChanges || []).filter((row) => num(row.new_rate) != null);
  const events = rows.map((row, index) => {
    const previous = [...rows.slice(0, index)].reverse().find((item) => item.direction === "up" || item.direction === "down");
    const direction = row.direction === "up" || row.direction === "down" ? row.direction : null;
    const continuous = previous && num(row.old_rate) != null && Math.abs(num(row.old_rate) - num(previous.new_rate)) < 0.001;
    let trigger = null;
    let baseIrs = null;
    if (direction && previous) {
      const start = onOrBefore(state.irs3, previous.effective_date);
      if (start) {
        baseIrs = start.value;
        for (const point of state.irs3) {
          if (point.date <= previous.effective_date || point.date > row.effective_date) continue;
          if (Math.abs(point.value - start.value) >= AIRBANK_TRIGGER_BP / 100) {
            trigger = { date: point.date, irs: point.value, base: start.value, moveBp: (point.value - start.value) * 100 };
            break;
          }
        }
      }
    }
    const irsAtChange = onOrBefore(state.irs3, row.effective_date);
    const margin = irsAtChange ? (num(row.new_rate) - irsAtChange.value) * 100 : null;
    const lag = trigger ? daysBetween(trigger.date, row.effective_date) : null;
    const irsMoveBp = baseIrs != null && irsAtChange ? (irsAtChange.value - baseIrs) * 100 : null;
    return { ...row, direction, continuous, trigger, irsAtChange, margin, lag, irsMoveBp };
  });
  const usable = events.filter((event) => event.continuous && event.lag != null);
  const lastLevel = rows[rows.length - 1];
  const irsNow = state.irs3[state.irs3.length - 1];
  return {
    events,
    usable,
    medianLag: median(usable.map((event) => event.lag)),
    lagMin: usable.length ? Math.min(...usable.map((event) => event.lag)) : null,
    lagMax: usable.length ? Math.max(...usable.map((event) => event.lag)) : null,
    medianTriggerMove: median(usable.map((event) => Math.abs(event.irsMoveBp))),
    medianMargin: median(events.filter((event) => event.margin != null && event.direction).map((event) => event.margin)),
    sinceLastBp: irsNow && lastLevel ? ((() => { const at = onOrBefore(state.irs3, lastLevel.effective_date); return at ? (irsNow.value - at.value) * 100 : null; })()) : null,
    currentMargin: irsNow && lastLevel ? (num(lastLevel.new_rate) - irsNow.value) * 100 : null,
    lastLevel,
  };
}
function renderMain() {
  const el = document.getElementById("chart-main");
  const last = state.irs3[state.irs3.length - 1];
  if (!last || !window.echarts) { el.textContent = "Graf se nepodařilo vykreslit."; return; }
  const from = cutoff(last.date, state.range);
  const irs = state.irs3.filter((point) => point.date >= from);
  const analysis = analyzeAirbank();
  const verified = analysis.events.filter((event) => num(event.new_rate) != null).map((event) => ({ date: event.effective_date, value: num(event.new_rate) }));
  const before = inForce(verified, from);
  const air = verified.filter((point) => point.date >= from);
  if (before && (!air.length || air[0].date !== before.date)) air.unshift(before);
  if (air.length) air.push({ date: last.date, value: air[air.length - 1].value });
  const markers = [
    { yAxis: state.rb || 5.45, label: { formatter: "RB 5,45 %", color: "#6d645b", position: "insideEndTop" }, lineStyle: { type: "dashed", color: "#6d645b" } },
  ];
  for (const event of analysis.events) {
    if (event.effective_date < from) continue;
    if (event.direction) {
      markers.push({
        xAxis: event.effective_date,
        label: { formatter: (event.direction === "up" ? "↑ " : "↓ ") + pct(num(event.new_rate)), color: event.direction === "up" ? "#b24a2c" : "#1b7a46", fontSize: 11, position: "insideEndTop" },
        lineStyle: { type: "solid", color: event.direction === "up" ? "#b24a2c" : "#1b7a46", width: 1.4 },
      });
    } else {
      markers.push({
        xAxis: event.effective_date,
        label: { formatter: pct(num(event.new_rate)), color: "#6d645b", fontSize: 11, position: "insideEndTop" },
        lineStyle: { type: "solid", color: "#6d645b", width: 1 },
      });
    }
    if (event.trigger && event.trigger.date >= from) {
      markers.push({
        xAxis: event.trigger.date,
        label: { formatter: "trigger " + nf.format(event.trigger.irs), fontSize: 10, color: "#6d645b", position: "insideStartBottom" },
        lineStyle: { type: "dotted", color: "#8a7a68", width: 1.2 },
      });
    }
  }
  const series = [
    line("3Y IRS", irs, {
      color: "#173848",
      lineStyle: { width: 2.4 },
      markLine: { silent: true, symbol: "none", data: markers },
    }),
    line("Air Bank 3Y s pojištěním", air, {
      color: "#b24a2c",
      step: "end",
      lineStyle: { width: 2 },
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
  renderAirbankEvents(analysis);
}
function renderAirbankEvents(analysis) {
  const body = document.querySelector("#airbank-events tbody");
  const summary = document.getElementById("airbank-summary");
  if (!body || !summary) return;
  body.innerHTML = analysis.events.map((event) => `<tr>
    <td>${esc(event.effective_date.split("-").reverse().join(". "))}</td>
    <td class="num">${num(event.old_rate) == null ? "n/a" : pct(num(event.old_rate))}</td>
    <td class="num">${pct(num(event.new_rate))}</td>
    <td>${event.direction === "up" ? "↑" : event.direction === "down" ? "↓" : "n/a"}</td>
    <td>${event.trigger ? esc(event.trigger.date.split("-").reverse().join(". ")) + " · " + pct(event.trigger.irs, 2) + (event.irsMoveBp == null ? "" : " · do změny " + signed(event.irsMoveBp, " bp", 0)) : "n/a"}</td>
    <td class="num">${event.lag == null ? "n/a" : event.lag + " dní" + (event.continuous ? "" : ", mimo medián")}</td>
    <td class="num">${event.irsAtChange ? pct(event.irsAtChange.value, 2) : "n/a"}</td>
    <td class="num">${event.margin == null ? "n/a" : signed(event.margin, " bp", 0)}</td>
    <td><a href="${esc(event.source_url)}">${esc(event.source)}</a></td>
  </tr>`).join("");
  const marginGap = analysis.medianMargin != null && analysis.currentMargin != null ? analysis.currentMargin - analysis.medianMargin : null;
  summary.textContent = analysis.usable.length
    ? `Práh triggeru ${AIRBANK_TRIGGER_BP} bp: první den, kdy se 3Y IRS od hladiny v den předchozí ověřené změny posunul aspoň o ${AIRBANK_TRIGGER_BP} bp. Medián prodlevy ${analysis.medianLag} dní, rozsah ${analysis.lagMin}–${analysis.lagMax} dní, n=${analysis.usable.length}. Do mediánu vstupují jen návazné změny, u kterých práh nastal. Medián velikosti pohybu IRS od předchozí změny do dne změny sazby ${analysis.medianTriggerMove == null ? "n/a" : nf.format(analysis.medianTriggerMove) + " bp"}. Medián marže sazba − IRS ${analysis.medianMargin == null ? "n/a" : nf.format(analysis.medianMargin) + " bp"}. Od poslední ověřené hladiny IRS ${analysis.sinceLastBp == null ? "n/a" : signed(analysis.sinceLastBp, " bp")}. Aktuální marže ${analysis.currentMargin == null ? "n/a" : signed(analysis.currentMargin, " bp")}, rozdíl proti mediánu ${marginGap == null ? "n/a" : signed(marginGap, " bp")}.`
    : "n/a";
}

function renderSpread() {
  const el = document.getElementById("chart-spread");
  const last = state.irs3[state.irs3.length - 1];
  if (!last || !window.echarts) return;
  const from = cutoff(last.date, state.range);
  const verified = analyzeAirbank().events.filter((event) => num(event.new_rate) != null).map((event) => ({ date: event.effective_date, value: num(event.new_rate) }));
  const points = state.irs3.filter((point) => point.date >= from).map((point) => {
    const air = inForce(verified, point.date);
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

function fourWeekView() {
  const shares = influenceShares();
  const rows = Object.keys(shares).map((id) => {
    const driver = DRIVERS.find((item) => item.id === id);
    const meta = driverMeta(id);
    const points = state.series[id] || [];
    const lastPoint = points[points.length - 1];
    const irsLast = state.irs3[state.irs3.length - 1];
    const age = lastPoint && irsLast ? (new Date(irsLast.date + "T00:00:00Z") - new Date(lastPoint.date + "T00:00:00Z")) / 86400000 : 999;
    const delta = age <= 35 ? change(points, 28) : null;
    const contrib = delta == null || meta.beta == null ? null : meta.beta * delta * 100;
    return { id, title: driver ? driver.title : id, weight: shares[id].pct, contrib };
  }).sort((a, b) => b.weight - a.weight);
  const weighted = rows.reduce((sum, row) => row.contrib == null ? sum : sum + (row.weight / 100) * row.contrib, 0);
  const actual = change(state.irs3, 28);
  return { rows, weighted, actualBp: actual == null ? null : actual * 100 };
}
function renderInfluence() {
  const view = fourWeekView();
  const max = Math.max(...view.rows.map((row) => row.weight), 1);
  document.getElementById("weight-list").innerHTML = view.rows.map((row) => {
    const arrow = row.contrib == null ? "n/a" : row.contrib > 0 ? "↑" : row.contrib < 0 ? "↓" : "→";
    const tone = row.contrib == null ? "" : row.contrib > 0 ? "up" : row.contrib < 0 ? "down" : "";
    const bpText = row.contrib == null ? "n/a" : `${arrow} ${signed(row.contrib, " bp")}`;
    return `<div class="weight-row">
      <div class="weight-name">${esc(row.title)}</div>
      <div class="weight-bar"><span style="width:${(row.weight / max) * 100}%"></span></div>
      <div class="weight-pct">${row.weight} %</div>
      <div class="weight-bp ${tone}">${bpText}</div>
    </div>`;
  }).join("");
  document.getElementById("weight-total").textContent =
    `Vážený součet příspěvků za 4 týdny: ${signed(view.weighted, " bp")}. Skutečný pohyb 3Y IRS za 4 týdny: ${view.actualBp == null ? "n/a" : signed(view.actualBp, " bp")}. Váha je |korelace| vydělená součtem absolutních korelací. Příspěvek je beta × změna faktoru za 28 dní.`;
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
      const irsLast = state.irs3[state.irs3.length - 1];
      const age = irsLast ? (new Date(irsLast.date + "T00:00:00Z") - new Date(last.date + "T00:00:00Z")) / 86400000 : 999;
      const delta4 = age <= 35 ? change(points, 28) : null;
      const beta = driverMeta(driver.id).beta;
      const contrib4 = delta4 == null || beta == null ? null : beta * delta4 * 100;
      const arrow = contrib4 == null ? "" : contrib4 > 0 ? "↑ " : contrib4 < 0 ? "↓ " : "→ ";
      const shareHtml = share ? `<div class="share"><b>${share.pct} %</b><span class="share-track"><span class="share-fill" style="width:${share.pct}%"></span></span><span class="${contrib4 == null ? "" : cls(contrib4)}">${contrib4 == null ? "n/a" : arrow + signed(contrib4, " bp")}</span></div>` : "";
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

function renderOutlook() {
  const row = (state.outlook || []).find((item) => item.meeting_date === "2026-12-17") || (state.outlook || [])[0];
  const node = document.getElementById("cnb-outlook");
  if (!node) return;
  if (!row) {
    node.textContent = "n/a";
    return;
  }
  const direction = ({ up: "↑ nahoru", down: "↓ dolů", flat: "→ beze změny" })[row.direction] || "n/a";
  const bp = row.bp && row.bp !== "n/a" ? row.bp + " bp" : "n/a";
  const repo = row.expected_repo && row.expected_repo !== "n/a" ? row.expected_repo + " %" : "n/a";
  node.innerHTML = `<strong>${direction}</strong>, krok ${esc(bp)}, očekávané repo ${esc(repo)}<br>${esc(row.source || "")}<br>k ${esc((row.as_of || "").split("-").reverse().join(". "))}`;
}
function renderSavings() {
  const root = document.getElementById("savings-tiles");
  if (!root) return;
  root.innerHTML = (state.savings || []).map((row) => tile({
    label: row.bank,
    value: row.rate_pct && row.rate_pct !== "n/a" ? pct(num(row.rate_pct)) : "n/a",
    sub: `${esc(row.conditions || "")}<br><span class="hint-inline">${esc((row.as_of || "").split("-").reverse().join(". "))} · ${esc(row.source_url || row.source || "")}</span>`,
  })).join("") || `<article class="tile"><div class="value">n/a</div></article>`;
}
function renderOffset() {
  const loan = num(document.getElementById("loan").value);
  const delta = num(document.getElementById("delta").value);
  const rm = num(document.getElementById("rmort").value);
  const rs = num(document.getElementById("rsav").value);
  const out = document.getElementById("offset-result");
  const inputs = document.getElementById("offset-inputs");
  const savingsLabel = document.getElementById("rsav").selectedOptions?.[0]?.textContent || (rs == null ? "n/a" : rs + " %");
  const pp = (value) => value.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  inputs.textContent = `Vstupy: L = ${loan == null ? "n/a" : new Intl.NumberFormat("cs-CZ").format(loan)} Kč, Δ = ${delta == null ? "n/a" : pp(delta) + " p. b."}, r hypotéky = ${rm == null ? "n/a" : pp(rm) + " %"} s offsetem, r spoření = ${savingsLabel}. Daň vkladů 15 %.`;
  if (loan == null || delta == null || rm == null || rs == null) {
    out.textContent = "n/a";
    return;
  }
  const denom = rm - rs * 0.85;
  if (denom <= 0) {
    out.textContent = "n/a";
    return;
  }
  const deposit = loan * delta / denom;
  const share = deposit / loan * 100;
  out.textContent = `${new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 }).format(deposit)} Kč, tedy ${nf.format(share)} % úvěru`;
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
  ["loan", "delta", "rmort", "rsav"].forEach((id) => {
    const field = document.getElementById(id);
    field.addEventListener("input", renderOffset);
    field.addEventListener("change", renderOffset);
  });
  window.addEventListener("resize", () => charts.forEach((chart) => chart.resize()));
}

async function main() {
  document.getElementById("chip-cnb").textContent = chip(daysUntil("2026-12-17"));
  document.getElementById("chip-feb").textContent = chip(daysUntil("2027-02-01"));
  const [metaText, influenceText, irs3Text, irs1Text, irs5Text, fxText, airText, bankText, outlookText, savingsText, changesText] = await Promise.all([
    load("data/meta.json"), load("data/influence.json"), load("data/irs_3y.csv"), load("data/irs_1y.csv"),
    load("data/irs_5y.csv"), load("data/cnb_fx.csv"), load("data/airbank_3y.csv"), load("data/bank_rates.csv"),
    load("data/cnb_outlook.csv"), load("data/savings_rates.csv"), load("data/airbank_changes.csv"),
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
  state.outlook = parseCsv(outlookText);
  state.savings = parseCsv(savingsText);
  state.airChanges = parseCsv(changesText);
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
  renderOutlook();
  renderTiles();
  renderSavings();
  renderOffset();
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
