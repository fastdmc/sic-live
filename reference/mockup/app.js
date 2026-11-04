"use strict";
/* Data: curated.vSIC_Hourly, SiteKey HFI, ProductionDate 2026-11-02. Every hour of every line, checked:
   packs and targets add to each line's shift totals, giveaway kg and rejects add to the shift figures,
   unexplained minutes match lost minutes less logged stops, and minutes never exceed 60 in an hour. */
const DATA = /*__DATA__*/;
const META = DATA.meta;

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const pad = n => String(((n % 24) + 24) % 24).padStart(2, "0");
const fmt = n => Math.round(n).toLocaleString("en-GB");
const f1 = n => (Math.round(n * 10) / 10).toFixed(1);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const pct = (a, t) => t > 0 ? Math.round(a / t * 100) : null;
const ragOf = (a, t) => !(t > 0) ? "N" : a / t >= .95 ? "G" : a / t >= .85 ? "A" : "R";
const WORD = {G: "Green", A: "Amber", R: "Red", N: "Not rated"};
const sh = r => `<i class="sh ${r}" aria-hidden="true"></i>`;
const HOURS = Array.from({length: 18}, (_, i) => i + 6);
const FIRST_H = 6, LAST_H = 23, DEFAULT_H = 14;
const hrLbl = h => `${pad(h)}:00–${pad(h + 1)}:00`;
const hrS = h => `${pad(h)}–${pad(h + 1)}`;
const clock = mins => `${pad(Math.floor(mins / 60))}:${String(Math.round(mins % 60)).padStart(2, "0")}`;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { if (v === null || v === "") localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
};
const RULE = "Red 2 hours running goes to the area manager, 3 hours to the site";

const ICONS = {
  site: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  area: '<path d="M12 3 2 8l10 5 10-5-10-5Z"/><path d="m2 13 10 5 10-5"/>',
  bars: '<path d="M3 21h18"/><rect x="5" y="11" width="3" height="7" rx=".5"/><rect x="10.5" y="6" width="3" height="12" rx=".5"/><rect x="16" y="9" width="3" height="9" rx=".5"/>',
  tvs: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  sheet: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
  auto: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor"/>',
  tv: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  play: '<path d="M7 4v16l13-8Z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>', chevR: '<path d="m9 18 6-6-6-6"/>',
  chevsL: '<path d="m11 17-5-5 5-5M18 17l-5-5 5-5"/>', chevsR: '<path d="m13 17 5-5-5-5M6 17l5-5-5-5"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  rotate: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5V8Z"/><path d="M3 8l9 5 9-5M12 13v8"/>'
};
const ic = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;

/* ---------- model ---------- */
const parseMins = s => !s ? [] : s.split("; ").map(p => { const m = p.match(/^(.*?) (\d+)m$/); return m ? {name: m[1], mins: +m[2]} : {name: p, mins: 0}; }).filter(i => i.mins > 0);
const AREAS = DATA.areas;
const L = {}, ALL = [];
for (const ar of AREAS) for (const [sub, ns] of ar.subs) for (const n of ns) {
  const src = DATA.lines[n];
  const o = {no: n, area: ar.id, areaName: ar.name, sub, has: !!src, H: {}, hs: []};
  o.runs = (DATA.sched[n] || []).filter(r => !r.jump);
  o.jumps = (DATA.sched[n] || []).filter(r => r.jump);
  o.planH = {}; for (const [k, v] of Object.entries(DATA.plan[n] || {})) o.planH[+k] = v;
  o.hasPlan = Object.keys(o.planH).length > 0;
  o.planDay = o.runs.reduce((a, r) => a + r.plan, 0);
  if (src) {
    Object.assign(o, {fc: src.fc ? src.fc.slice(0, 5) : "–", arts: src.arts, gwPct: src.gwPct, gwKg: src.gwKg, rejDay: src.rej});
    for (const x of src.hours) {
      x.items = parseMins(x.iss).map(i => ({...i, name: i.name === "(no reason)" ? "Stop with no reason" : i.name}));
      x.plans = parseMins(x.plt);
      x.coded = Math.max(0, x.lost - x.unx);
      x.off = Math.max(0, 60 - x.av - x.pln - x.uns);
      x.decl = (x.gkg != null && x.gpc) ? x.gkg / x.gpc * 100 : 0;
      x.plan = o.planH[x.h] ?? null;
      x.sched = runsIn(o, x.h);
      o.H[x.h] = x;
    }
    o.hs = Object.keys(o.H).map(Number).sort((a, b) => a - b);
    o.first = o.hs[0]; o.last = o.hs[o.hs.length - 1];
    const f = o.H[o.first], l = o.H[o.last];
    o.start = clock(o.first * 60 + Math.max(0, 60 - f.av - f.pln - f.uns));
    o.end = clock(o.last * 60 + Math.min(60, l.av + l.pln));
    o.crew = f.crew;
  }
  L[n] = o; ALL.push(o);
}
function runsIn(o, h) { const a = h * 60, b = a + 60; return o.runs.filter(r => r.s < b && r.e > a).map(r => ({r, ov: Math.min(r.e, b) - Math.max(r.s, a)})).sort((p, q) => q.ov - p.ov); }
const tm = m => `${pad(Math.floor(m / 60))}:${String(m % 60).padStart(2, "0")}`;
const runState = (r, h) => { const t = (h + 1) * 60; return r.e <= t ? "done" : r.s < t ? "now" : "next"; };
const ALLRUNS = [];
const areaById = id => AREAS.find(a => a.id === id);
for (const o of ALL) for (const r of o.runs) ALLRUNS.push({o, r});
const linesOf = ar => ar.subs.flatMap(([, ns]) => ns.map(n => L[n]));
const withData = ls => ls.filter(o => o.has);
const CACHE = new Map();
function cum(o, h) {
  const key = o.no + ":" + h;
  if (CACHE.has(key)) return CACHE.get(key);
  const c = {a: 0, t: 0, lost: 0, unx: 0, coded: 0, stop: 0, pln: 0, uns: 0, av: 0, off: 0, gkg: 0, decl: 0, rej: 0, G: 0, A: 0, R: 0, N: 0, hrs: 0, plan: 0, planA: 0};
  if (o.has) {
    for (const k of o.hs) {
      if (k > h) break;
      const x = o.H[k];
      c.a += x.a; c.t += x.t; c.lost += x.lost; c.unx += x.unx; c.coded += x.coded; c.stop += x.stop;
      c.pln += x.pln; c.uns += x.uns; c.av += x.av; c.off += x.off; c.gkg += x.gkg || 0; c.decl += x.decl; c.rej += x.rej; c[x.rag]++; c.hrs++;
    }
    if (h >= o.last) { c.gkg = o.gwKg; if (o.gwPct > 0) c.decl = o.gwKg / (o.gwPct / 100); c.lost = DATA.lines[o.no].shiftLost; c.coded = Math.max(0, c.lost - c.unx); }
  }
  for (const [k, v] of Object.entries(o.planH)) if (+k <= h) c.plan += v;
  c.planA = o.hasPlan ? c.a : 0;
  c.gpc = c.decl > 0 ? c.gkg / c.decl * 100 : 0;
  c.run = Math.max(0, c.av - c.lost);
  CACHE.set(key, c);
  return c;
}
const status = (o, h) => !o.has ? "none" : h < o.first ? "pre" : h > o.last ? "done" : "run";
function streak(o, h) {
  if (status(o, h) !== "run") return 0;
  let s = 0;
  for (let x = h; x >= o.first; x--) {
    const c = o.H[x];
    if (!c) break;
    if (c.rag === "N") continue;
    if (c.rag === "R") s++; else break;
  }
  return s;
}
function agg(lines, h) {
  const g = {a: 0, t: 0, lost: 0, unx: 0, coded: 0, pln: 0, uns: 0, av: 0, off: 0, gkg: 0, decl: 0, rej: 0, plan: 0, planA: 0, running: 0, now: {G: 0, A: 0, R: 0, N: 0}};
  for (const o of lines) {
    if (!o.has) continue;
    const c = cum(o, h);
    for (const k of ["a", "t", "lost", "unx", "coded", "pln", "uns", "av", "off", "gkg", "decl", "rej", "plan", "planA"]) g[k] += c[k];
    if (status(o, h) === "run") { g.running++; g.now[o.H[h].rag]++; }
  }
  g.gpc = g.decl > 0 ? g.gkg / g.decl * 100 : 0;
  return g;
}
const escalations = (lines, h) => lines.map(o => ({o, s: streak(o, h), c: cum(o, h)})).filter(x => x.s >= 2)
  .sort((x, y) => y.s - x.s || (y.c.t - y.c.a) - (x.c.t - x.c.a));
function reasons(lines, h) {
  const m = new Map();
  for (const o of lines) for (const k of o.hs) {
    if (k > h) break;
    for (const i of o.H[k].items) {
      const r = m.get(i.name) || {name: i.name, mins: 0, lines: new Set()};
      r.mins += i.mins; r.lines.add(o.no); m.set(i.name, r);
    }
  }
  return [...m.values()].sort((a, b) => b.mins - a.mins);
}
const lostHours = (lines, h, n) => lines.flatMap(o => o.hs.filter(k => k <= h && o.H[k].lost >= 5).map(k => ({o, x: o.H[k]})))
  .sort((a, b) => b.x.lost - a.x.lost).slice(0, n);
const fcSeen = (o, h) => { if (!o.has || o.fc === "–") return false; const [a, b] = o.fc.split(":").map(Number); return a * 60 + b <= (h + 1) * 60; };
const fcTxt = (o, h) => fcSeen(o, h) ? o.fc : "not yet";
const reasonTxt = x => x.items.length ? x.items.map(i => `${esc(i.name)} ${i.mins}m`).join(" · ") : "";
const planTxt = x => x.plans.length ? x.plans.map(i => `${esc(i.name)} ${i.mins}m`).join(" · ") : "";
const lossTag = x => x.loss === "Failure" ? `<span class="tag fail">Failure</span>` : x.loss === "Line Restraint" ? `<span class="tag lr">Restraint</span>` : "";

/* ---------- small renderers ---------- */
const kpi = (k, v, s, cls = "") => `<div class="kpi ${cls}"><div class="k">${k}</div><div class="v num">${v}</div><div class="s">${s}</div></div>`;
const counts = (now, withN = true) => ["G", "A", "R"].map(r => `<span class="cnt ${r}">${sh(r)}${now[r]}</span>`).join("") + (withN && now.N ? `<span class="cnt N">${sh("N")}${now.N}</span>` : "");
const runTxt = g => `${g.running} running${g.now.N ? ` · ${g.now.N} not rated` : ""}`;
const shortTxt = (t, a) => t - a >= 0 ? `<b class="num">${fmt(t - a)}</b> short` : `<b class="num">${fmt(a - t)}</b> ahead`;
const pageHead = (t, s, acts = "") => `<div class="phead"><div><h1>${t}</h1><p>${s}</p></div><div class="acts">${acts}</div></div>`;
const tvBtn = `<button class="btn" type="button" data-act="kiosk">${ic("tv")}Show on TV</button>`;
const asAt = h => `as at ${pad(h + 1)}:00`;
function kpiRow(g, scope) {
  const r = ragOf(g.a, g.t);
  return `<div class="kpis">
    ${kpi("Packs v target", `${sh(r)}${pct(g.a, g.t) ?? "–"}%`, `${WORD[r]} · ${scope} · best shift`, "fill " + r)}
    ${kpi("Packs so far", fmt(g.a), `of ${fmt(g.t)} target · ${shortTxt(g.t, g.a).replace(/<[^>]+>/g, "")}`)}
    ${g.plan > 0 ? kpi("Packs v plan", `${pct(g.planA, g.plan)}%`, `${fmt(g.planA)} of ${fmt(g.plan)} on the schedule`, "plan") : kpi("Packs v plan", "–", "no schedule for these lines", "plan")}
    ${kpi("Lines this hour", counts(g.now, false), runTxt(g), "cn")}
    ${kpi("Lost minutes", fmt(g.lost), `${fmt(g.unx)} with no reason logged`)}
    ${kpi("Giveaway so far", `${fmt(g.gkg)}<small>kg</small>`, `${g.gpc.toFixed(2)}% over · ${fmt(g.rej)} rejects`)}
  </div>`;
}
const prodShort = d => esc(String(d).replace(/\s+(MPQAS|MPQA|TWA|FQA TWA)$/i, ""));
function prodLine(o, h, big) {
  const x = o.H[h], ss = x ? x.sched : runsIn(o, h);
  if (!ss.length) return o.hasPlan ? `<div class="prodnow none">Nothing on the schedule this hour</div>` : "";
  const main = ss[0].r, more = ss.length - 1;
  return `<div class="prodnow${big ? " big" : ""}"><span class="sap">${esc(main.sap)}</span><span class="pd">${prodShort(main.desc)}</span>${more ? `<span class="more">+${more} more</span>` : ""}</div>`;
}
function hourTip(o, x) {
  let t = `<b>L${o.no} · ${hrLbl(x.h)}</b><br>${fmt(x.a)} of ${fmt(x.t)} packs${x.t > 0 ? ` · ${pct(x.a, x.t)}%` : ""}`;
  t += `<br>${x.lost ? x.lost + " min lost" : "No time lost"}${x.unx >= 1 ? `, ${f1(x.unx)} with no reason` : ""}`;
  if (x.items.length) t += `<br><span class="tg">Stops</span> ${reasonTxt(x)}`;
  if (x.plans.length) t += `<br><span class="tg">Planned</span> ${planTxt(x)}`;
  if (x.rag === "N") t += `<br><span class="tg">Not rated: ${Math.round(x.av)} min available</span>`;
  if (x.sched.length) t += `<br><span class="tg">Scheduled</span> ${x.sched.map(s => `${esc(s.r.sap)} ${prodShort(s.r.desc)}`).join("; ")}`;
  if (x.plan != null) t += `<br><span class="tg">Plan</span> ${fmt(x.plan)} packs`;
  t += `<br><span class="tg">Omega article</span> ${esc(x.prod || "–")}${x.n > 1 ? ` +${x.n - 1}` : ""}`;
  return esc(t);
}
function cell(o, x, h, showSh = true) {
  if (!x) return `<div class="c off"></div>`;
  if (x.h > h) return `<div class="c fut"></div>`;
  const p = pct(x.a, x.t);
  return `<div class="c ${x.rag}${x.h === h ? " now" : ""}" data-tip="${hourTip(o, x)}">${showSh ? sh(x.rag) : ""}<span class="num">${p ?? "–"}</span></div>`;
}
function hbars(rows, max, cls = "") {
  return `<div class="hbars">${rows.map(r => `<div class="hb"><span class="hn">${r.n}</span><div class="bar"><div class="fill ${cls}" style="width:${max ? Math.max(2, r.v / max * 100) : 0}%"></div></div><span class="hv num">${r.t}</span></div>`).join("")}</div>`;
}

/* ---------- site ---------- */
function heat(h) {
  let s = `<div class="hm"><div class="hm-head" aria-hidden="true"><div></div>${HOURS.map(x => `<div class="${x === h ? "now" : ""}">${pad(x)}</div>`).join("")}<div>So far</div></div>`;
  for (const ar of AREAS) {
    const ls = linesOf(ar), g = agg(ls, h);
    s += `<a class="hm-area" href="${route("area/" + ar.id)}"><b>${ar.name}</b><span>${withData(ls).length} lines · <span class="num">${pct(g.a, g.t) ?? "–"}%</span> so far · ${g.now.R} red this hour</span><span class="go">Open ›</span></a>`;
    for (const o of ls) {
      const c = cum(o, h), r = ragOf(c.a, c.t), st = status(o, h);
      const tot = !o.has ? `<div class="tot N">No data</div>` : st === "pre" ? `<div class="tot N">From ${pad(o.first)}:00</div>` : `<div class="tot ${r}">${sh(r)}<span class="num">${pct(c.a, c.t) ?? "–"}%</span></div>`;
      s += `<a class="hm-row" href="${lineHref(o)}" aria-label="Line ${o.no}, ${esc(o.sub)}"><div class="lbl"><b>L${o.no}</b><small>${esc(o.sub)}</small></div>${HOURS.map(x => cell(o, o.H[x], h)).join("")}${tot}</a>`;
    }
  }
  return s + `</div>`;
}
function areaCard(ar, h) {
  const g = agg(linesOf(ar), h), r = ragOf(g.a, g.t);
  return `<a class="acard ${r}" href="${route("area/" + ar.id)}">
    <div class="ac-top"><span class="ac-name">${ar.name}</span><span class="pill ${r}">${sh(r)}<span class="num">${pct(g.a, g.t) ?? "–"}%</span></span></div>
    <div class="ac-row"><b class="num">${fmt(g.a)}</b> of <span class="num">${fmt(g.t)}</span> · ${shortTxt(g.t, g.a)}</div>
    <div class="ac-row">This hour ${counts(g.now)}· lost <b class="num">${fmt(g.lost)}</b> min</div></a>`;
}
function escCard(es, withArea) {
  const items = es.map(({o, s, c}) => `<a class="esc-i" href="${lineHref(o)}"><span class="tag ${s >= 3 ? "site" : "am"}">${s >= 3 ? "Site" : "Area mgr"}</span><span class="esc-t"><b>L${o.no}</b> ${withArea ? o.areaName : esc(o.sub)} · <b>${s} h</b> red · ${shortTxt(c.t, c.a)}</span><span class="go">›</span></a>`).join("");
  return `<section class="card esc"><div class="label">Escalate now · <b>${es.length}</b></div><div class="esc-list">${items || `<div class="empty">No line has been red for 2 hours running.</div>`}</div></section>`;
}
function reasonsCard(lines, h, n = 8) {
  const rs = reasons(lines, h).slice(0, n);
  const max = rs.length ? rs[0].mins : 0;
  return `<section class="card"><div class="label">Logged stop reasons so far</div>${rs.length ? hbars(rs.map(r => ({n: `${esc(r.name)}<small>${[...r.lines].map(x => "L" + x).join(" ")}</small>`, v: r.mins, t: `${fmt(r.mins)} min`})), max, "stop") : `<div class="empty">No stops logged yet.</div>`}</section>`;
}
function noReasonCard(lines, h, n = 8) {
  const rs = withData(lines).map(o => ({o, c: cum(o, h)})).filter(x => x.c.unx >= 1).sort((a, b) => b.c.unx - a.c.unx).slice(0, n);
  const max = rs.length ? rs[0].c.unx : 0;
  return `<section class="card"><div class="label">Lost with no reason logged</div>${rs.length ? hbars(rs.map(x => ({n: `L${x.o.no}<small>${esc(x.o.sub)}</small>`, v: x.c.unx, t: `${fmt(x.c.unx)} min`})), max, "gap") : `<div class="empty">Every lost minute has a reason.</div>`}<div class="hint" style="margin-top:auto;padding-top:calc(var(--u)*1.2)">Minutes short of target with no stop in Omega. The line leader writes the reason on the SIC sheet.</div></section>`;
}
function giveawayCard(lines, h, n = 8) {
  const rs = withData(lines).map(o => ({o, c: cum(o, h)})).filter(x => x.c.gkg > 0).sort((a, b) => b.c.gkg - a.c.gkg).slice(0, n);
  const max = rs.length ? rs[0].c.gkg : 0;
  return `<section class="card"><div class="label">Giveaway so far by line</div>${rs.length ? hbars(rs.map(x => ({n: `L${x.o.no}<small>${esc(x.o.sub)}</small>`, v: x.c.gkg, t: `${fmt(x.c.gkg)} kg <small>${x.c.gpc.toFixed(1)}%</small>`})), max) : `<div class="empty">No giveaway yet.</div>`}</section>`;
}
function viewSite(h, tv = false) {
  const g = agg(ALL, h), es = escalations(ALL, h);
  return `<div class="view v-site">
    ${tv ? "" : pageHead("Site overview", `${withData(ALL).length} lines · ${META.dateLabel} · crew ${META.crew} · ${asAt(h)}`, tvBtn)}
    ${kpiRow(g, "all lines")}
    <div class="site-main">
      <section class="card"><div class="label">All lines by hour${tv ? "" : `<span class="go">Select a line or an area</span>`}</div><div class="hmwrap">${heat(h)}</div></section>
      <div class="side-col">${AREAS.map(ar => areaCard(ar, h)).join("")}${escCard(es, true)}</div>
    </div>
    ${tv ? "" : `<div class="row3">${reasonsCard(ALL, h)}${noReasonCard(ALL, h)}${giveawayCard(ALL, h)}</div>`}
  </div>`;
}

/* ---------- area ---------- */
function lineCard(o, h) {
  if (!o.has) return `<div class="lc off"><div class="lc-top"><span class="lno">L${o.no}</span><span class="lsub">${esc(o.sub)}</span><span class="ragbox idle">No data</span></div><div class="lc-foot">No production recorded for ${META.dateLabel}</div></div>`;
  const st = status(o, h), x = o.H[h], c = cum(o, h), rc = ragOf(c.a, c.t), pc = pct(c.a, c.t), s = streak(o, h);
  const box = st === "run" ? `<span class="ragbox ${x.rag}">${sh(x.rag)}<span class="num">${x.t > 0 ? pct(x.a, x.t) + "%" : "Idle"}</span></span>`
    : `<span class="ragbox idle">${st === "pre" ? "Starts " + o.start : "Finished " + o.end}</span>`;
  const tag = s >= 3 ? `<span class="tag site">Site</span>` : s >= 2 ? `<span class="tag am">Area mgr</span>` : "";
  const hs = []; for (let k = o.first; k <= o.last; k++) hs.push(k);
  const big = o.hs.filter(k => k <= h && o.H[k].lost >= 5).map(k => o.H[k]).sort((a, b) => b.lost - a.lost)[0];
  const bigTxt = big ? `${pad(big.h)}:00 ${big.items.length ? esc(big.items[0].name) : "no reason"} ${big.lost}m` : "";
  return `<a class="lc${s >= 3 ? " esc-site" : s >= 2 ? " esc-am" : ""}" href="${lineHref(o)}" aria-label="Line ${o.no}">
    <div class="lc-top"><span class="lno">L${o.no}</span><span class="lsub">${esc(o.sub)}<small>${fcSeen(o, h) ? "first crate " + o.fc : "no crate yet"}</small></span>${tag}${box}</div>
    ${prodLine(o, h, false)}
    <div class="lc-mid">
      <div><div class="k">This hour</div><div class="v num">${st === "run" ? fmt(x.a) : "–"}<small>${st === "run" ? " / " + fmt(x.t) : ""}</small></div></div>
      <div><div class="k">Shift so far · ${pc ?? "–"}%</div><div class="v num">${fmt(c.a)}<small> / ${fmt(c.t)}</small></div><div class="bar"><div class="fill ${rc}" style="width:${Math.min(100, pc || 0)}%"></div></div></div>
    </div>
    <div class="mini" style="grid-template-columns:repeat(${hs.length},minmax(0,1fr))">${hs.map(k => cell(o, o.H[k], h, false)).join("")}</div>
    <div class="lc-foot">Lost <b class="num">${fmt(c.lost)}</b> min, <b class="num">${fmt(c.unx)}</b> no reason · giveaway <b class="num">${c.gpc.toFixed(1)}%</b>${bigTxt ? ` · <b>${bigTxt}</b>` : ""}</div>
  </a>`;
}
function lhItem({o, x}, withLine) {
  const txt = x.items.length ? `<b>${reasonTxt(x)}</b>` : `No reason logged · <b class="num">${x.lost}</b> min lost`;
  return `<a class="lh" href="${lineHref(o)}"><span class="lh-h num">${pad(x.h)}:00</span>${withLine ? `<span class="lh-l">L${o.no}</span>` : ""}<span class="lh-t">${txt}</span>${lossTag(x)}</a>`;
}
function minutesCard(lines, h) {
  const rows = withData(lines).map(o => ({o, c: cum(o, h)})).filter(x => x.c.hrs > 0);
  const seg = c => {
    const tot = c.run + c.coded + c.unx + c.pln + c.uns + c.off || 1;
    const p = v => (v / tot * 100).toFixed(2) + "%";
    return `<div class="stack"><i style="width:${p(c.run)};background:var(--blue)"></i><i style="width:${p(c.coded)};background:var(--stop)"></i><i style="width:${p(c.unx)};background:var(--gap)"></i><i style="width:${p(c.pln)};background:var(--planned)"></i><i style="width:${p(c.uns + c.off)};background:var(--off)"></i></div>`;
  };
  return `<section class="card"><div class="label">Where the minutes went so far</div>
    <div class="hbars">${rows.map(({o, c}) => `<div class="mrow"><b>L${o.no}</b>${seg(c)}<span class="hint num">${fmt(c.lost)} lost · ${fmt(c.pln)} planned</span></div>`).join("") || `<div class="empty">No lines running yet.</div>`}</div>
    <div class="legend" style="margin-top:calc(var(--u)*1.4)">${minLegend()}</div></section>`;
}
const minLegend = () => `<span><i class="sw" style="background:var(--blue)"></i>Making packs at the target rate</span><span><i class="sw" style="background:var(--stop)"></i>Lost to a logged stop</span><span><i class="sw" style="background:var(--gap)"></i>Lost, no reason logged</span><span><i class="sw" style="background:var(--planned)"></i>Break, cleaning or change</span><span><i class="sw" style="background:var(--off);outline:1px solid var(--border)"></i>No shift or not started</span>`;
function viewArea(ar, h, tv = false) {
  const ls = linesOf(ar), g = agg(ls, h), es = escalations(ls, h), lh = lostHours(ls, h, tv ? 6 : 8);
  const two = ls.length <= 2, rows = Math.ceil(ls.length / (two ? 2 : 3));
  return `<div class="view v-area">
    ${tv ? "" : pageHead(`${ar.name} area`, `${withData(ls).length} lines · ${ar.subs.map(s => s[0]).join(", ")} · ${asAt(h)}`, tvBtn)}
    ${kpiRow(g, ar.name + " area")}
    <div class="area-main">
      <div class="cards${two ? " two" : ""}"${tv ? ` style="grid-template-rows:repeat(${rows},minmax(0,1fr))"` : ""}>${ls.map(o => lineCard(o, h)).join("")}</div>
      <div class="side-col">${escCard(es, false)}<section class="card lhc"><div class="label">Biggest lost hours so far</div><div class="lh-list">${lh.length ? lh.map(x => lhItem(x, true)).join("") : `<div class="empty">Nothing over 5 minutes yet.</div>`}</div></section></div>
    </div>
    ${tv ? "" : `<div class="row2">${reasonsCard(ls, h)}${minutesCard(ls, h)}</div>`}
  </div>`;
}

/* ---------- line ---------- */
function whyTxt(o, h) {
  const x = o.H[h], parts = [];
  if (x.items.length) parts.push(reasonTxt(x));
  else if (x.unx >= 5) parts.push(`<b class="num">${f1(x.unx)} min</b> short, no reason logged`);
  if (x.plans.length) parts.push("Planned: " + planTxt(x));
  if (x.av < 59.5 && x.av >= 1) parts.push(`${Math.round(x.av)} min to run`);
  if (x.note) parts.push(esc(x.note));
  if (fcSeen(o, h) && +o.fc.slice(0, 2) === h) parts.push(`First crate ${o.fc}`);
  return parts.join(" · ") || (x.lost ? "" : "On target, no time lost");
}
function hourCard(o, h, big) {
  const st = status(o, h), x = o.H[h];
  if (st !== "run") return `<div class="hourbox"><div><div class="huge" style="font-size:${big ? "calc(var(--u)*9)" : "calc(var(--u)*5.5)"}">${st === "pre" ? "Not started" : "Finished"}</div><div class="of">${st === "pre" ? `Starts <b>${o.start}</b>` : `Ran <b>${o.start}–${o.end}</b>`}</div></div><div class="ragsq idle"><div class="word">No<br>run</div></div></div>`;
  if (x.av < 1) { const nm = x.plans.length ? x.plans[0].name : "No run"; return `<div class="hourbox"><div><div class="huge" style="font-size:${big ? "calc(var(--u)*9)" : "calc(var(--u)*5.5)"}">${esc(nm)}</div><div class="of">No minutes to run this hour</div><div class="why">${whyTxt(o, h)}</div></div><div class="ragsq idle"><div class="word">No<br>run</div></div></div>`; }
  const p = pct(x.a, x.t);
  return `<div class="hourbox"><div>${prodLine(o, h, big)}<div class="huge num">${fmt(x.a)}</div><div class="of">packs · target <b class="num">${fmt(x.t)}</b>${x.plan != null ? ` · plan <b class="num">${fmt(x.plan)}</b>` : ""}</div><div class="why">${whyTxt(o, h)}</div></div>
    <div class="ragsq ${x.rag}" role="img" aria-label="${WORD[x.rag]}">${sh(x.rag)}<div class="pct num">${p == null ? "–" : p + "%"}</div><div class="word">${x.rag === "N" ? (x.plans.length ? esc(x.plans[0].name) : "Not rated") : WORD[x.rag]}</div></div></div>`;
}
function sofarCard(o, h) {
  const c = cum(o, h), rc = ragOf(c.a, c.t), pc = pct(c.a, c.t);
  return `<div class="sofar"><div><span class="huge num">${fmt(c.a)}</span></div>
    <div class="of">of <b class="num">${fmt(c.t)}</b> target <span class="pill ${rc}">${sh(rc)}<span class="num">${pc ?? "–"}%</span></span></div>
    <div class="tbar"><div class="fill ${rc}" style="width:${Math.min(100, pc || 0)}%"></div><div class="mark" style="left:100%"></div><div class="mtxt" style="left:100%">Target</div></div>
    <div class="stats"><div class="stat num"><small>${c.t - c.a >= 0 ? "Packs short" : "Packs ahead"}</small>${fmt(Math.abs(c.t - c.a))}</div><div class="stat num"><small>Lost minutes</small>${fmt(c.lost)}</div><div class="stat num"><small>No reason</small>${fmt(c.unx)}</div></div></div>`;
}
function tiles(o, h) {
  const hs = []; for (let k = o.first; k <= o.last; k++) hs.push(k);
  const t = hs.map(k => {
    const x = o.H[k];
    if (!x || k > h) return `<div class="tile fut"><span class="h num">${hrS(k)}</span><span class="p">–</span><span class="l">&nbsp;</span><span class="x">to come</span></div>`;
    const p = pct(x.a, x.t), now = k === h;
    const note = x.rag === "N" ? (x.plans.length ? esc(x.plans[0].name) : "Not rated") : x.lost ? `${x.lost} min lost` : (x.av < 45 ? `${Math.round(x.av)} min run` : "on target");
    return `<div class="tile ${x.rag}${now ? " now" : ""}" data-tip="${hourTip(o, x)}">${now ? `<span class="nowtag">${h >= o.last ? "LAST" : "NOW"}</span>` : ""}<span class="h num">${hrS(k)}</span><span class="p num">${fmt(x.a)}</span><span class="l">${sh(x.rag)}<span class="num">${p == null ? "–" : p + "%"}</span></span><span class="x num">${note}</span></div>`;
  }).join("");
  return `<div class="strip${hs.length > 14 ? " dense" : ""}" style="grid-template-columns:repeat(${hs.length},minmax(0,1fr))">${t}</div>`;
}
const niceCeil = v => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p; return 10 * p; };
function packsChart(o, h) {
  const hs = o.hs, W = 1240, H = 300, Lm = 52, Rm = 60, T = 22, B = 40, iw = W - Lm - Rm, ih = H - T - B, slot = iw / hs.length, bw = slot * .56;
  const maxH = niceCeil(Math.max(...hs.map(k => Math.max(o.H[k].a, o.H[k].t, o.H[k].plan || 0))) * 1.08);
  let ct = 0, ca = 0; const cT = [], cA = [];
  hs.forEach(k => { ct += o.H[k].t; ca += o.H[k].a; cT.push(ct); cA.push(ca); });
  const maxC = niceCeil(Math.max(ct, ca));
  const y = v => T + ih - v / maxH * ih, yc = v => T + ih - v / maxC * ih;
  const col = r => r === "G" ? "var(--g)" : r === "A" ? "var(--a)" : r === "R" ? "var(--r)" : "var(--planned)";
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Packs by hour against target for line ${o.no}, with the running totals">`;
  for (let i = 0; i <= 4; i++) { const v = maxH * i / 4; s += `<line class="grid" x1="${Lm}" x2="${W - Rm}" y1="${y(v)}" y2="${y(v)}"/><text x="${Lm - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text><text x="${W - Rm + 8}" y="${yc(maxC * i / 4) + 4}" style="fill:var(--blue)">${fmt(maxC * i / 4)}</text>`; }
  s += `<text x="${Lm}" y="${T - 8}">packs an hour</text><text x="${W - Rm + 8}" y="${T - 8}" style="fill:var(--blue)">running</text>`;
  const px = i => Lm + slot * i + slot / 2;
  s += `<polyline points="${hs.map((k, i) => `${px(i)},${yc(cT[i])}`).join(" ")}" fill="none" stroke="var(--blue)" stroke-width="2" stroke-dasharray="5 4" opacity=".7"/>`;
  const done = hs.filter(k => k <= h).length;
  if (done) s += `<polyline points="${hs.slice(0, done).map((k, i) => `${px(i)},${yc(cA[i])}`).join(" ")}" fill="none" stroke="var(--blue)" stroke-width="2.5"/><circle cx="${px(done - 1)}" cy="${yc(cA[done - 1])}" r="4" fill="var(--blue)"/>`;
  hs.forEach((k, i) => {
    const x = o.H[k], cx = px(i), bx = cx - bw / 2, fut = k > h;
    s += `<g data-tip="${fut ? esc(`<b>${hrLbl(k)}</b><br>To come`) : hourTip(o, x)}">`;
    s += `<rect x="${bx - 4}" y="${T}" width="${bw + 8}" height="${ih}" fill="transparent"/>`;
    if (!fut) s += `<rect x="${bx}" y="${y(x.a)}" width="${bw}" height="${Math.max(0, T + ih - y(x.a))}" fill="${col(x.rag)}" rx="2"/>`;
    s += `<rect x="${bx - 3}" y="${y(x.t)}" width="${bw + 6}" height="${Math.max(0, T + ih - y(x.t))}" fill="none" stroke="var(--text)" stroke-width="1.5" stroke-dasharray="${fut || x.a < x.t ? "4 3" : "0"}" opacity="${fut ? .35 : 1}" rx="2"/>`;
    if (!fut) s += `<text class="lbl2" x="${cx}" y="${Math.min(y(x.a), y(x.t)) - 6}" text-anchor="middle" style="paint-order:stroke;stroke:var(--surface);stroke-width:4px">${fmt(x.a)}</text>`;
    if (x.plan != null) s += `<line x1="${bx - 6}" x2="${bx + bw + 6}" y1="${y(x.plan)}" y2="${y(x.plan)}" stroke="var(--plan)" stroke-width="3" stroke-linecap="round" opacity="${fut ? .5 : 1}"/>`;
    s += `<text x="${cx}" y="${H - B + 17}" text-anchor="middle" style="${k === h ? "fill:var(--text);font-weight:800" : ""}">${hrS(k)}</text></g>`;
  });
  s += `<line x1="${Lm}" x2="${W - Rm}" y1="${T + ih}" y2="${T + ih}" stroke="var(--muted)"/>`;
  return s + `</svg>`;
}
function chartCard(o, h) {
  return `<section class="card"><div class="label">Packs by hour against target and plan</div>
    <div class="legend" style="margin-bottom:calc(var(--u)*1)"><span><i class="sw" style="background:var(--g)"></i>Green</span><span><i class="sw" style="background:var(--a)"></i>Amber</span><span><i class="sw" style="background:var(--r)"></i>Red</span><span><i class="sw" style="background:var(--planned)"></i>Not rated</span><span><i class="sw" style="border:2px solid var(--text)"></i>Target (dashed when missed)</span><span><i class="sw" style="background:var(--plan);height:.3em"></i>Plan from the schedule</span><span><i class="sw" style="background:var(--blue)"></i>Running actual, dashed running target (right scale)</span></div>
    <div class="chart">${packsChart(o, h)}</div></section>`;
}
function minsDetail(c) {
  const rows = [["var(--blue)", "Making packs at the target rate", c.run], ["var(--stop)", "Lost to a logged stop", c.coded], ["var(--gap)", "Lost, no reason logged", c.unx], ["var(--planned)", "Break, cleaning or change", c.pln], ["var(--off)", "No shift or not started", c.uns + c.off]];
  const tot = rows.reduce((a, r) => a + r[2], 0) || 1;
  return `<div class="mins"><div class="stack">${rows.map(r => `<i style="width:${(r[2] / tot * 100).toFixed(2)}%;background:${r[0]}"></i>`).join("")}</div>
    <div class="legend">${rows.map(r => `<span><span style="display:inline-flex;gap:.5em;align-items:center"><i class="sw" style="background:${r[0]};outline:1px solid var(--border)"></i>${r[1]}</span><b class="num">${fmt(r[2])} min</b></span>`).join("")}</div></div>`;
}
function plansCard(o, h) {
  const m = new Map();
  for (const k of o.hs) { if (k > h) break; for (const p of o.H[k].plans) { const r = m.get(p.name) || {n: 0, mins: 0}; r.n++; r.mins += p.mins; m.set(p.name, r); } }
  const rs = [...m.entries()].sort((a, b) => b[1].mins - a[1].mins);
  const max = rs.length ? rs[0][1].mins : 0;
  return `<section class="card"><div class="label">Planned stops and changes so far</div>${rs.length ? hbars(rs.map(([n, r]) => ({n: `${esc(n)}<small>${r.n} ${r.n === 1 ? "hour" : "hours"}</small>`, v: r.mins, t: `${r.mins} min`})), max) : `<div class="empty">None so far.</div>`}</section>`;
}
function scheduleCard(o, h) {
  if (!o.runs.length) return `<section class="card"><div class="label">Schedule</div><div class="empty">Line ${o.no} is not on the production schedule for ${META.dateLabel}.</div></section>`;
  const t = (h + 1) * 60, rs = o.runs.slice().sort((a, b) => a.s - b.s);
  const done = rs.filter(r => runState(r, h) === "done").length, now = rs.find(r => runState(r, h) === "now");
  const rows = rs.map(r => {
    const st = runState(r, h), prog = st === "now" ? Math.round((t - r.s) / (r.e - r.s) * 100) : st === "done" ? 100 : 0;
    return `<tr class="st-${st}"><td class="num">${tm(r.s % 1440)}–${tm(r.e % 1440)}${r.s >= 1440 ? ` <small>3 Nov</small>` : ""}</td><td><span class="sap">${esc(r.sap)}</span></td><td class="pdesc">${esc(r.desc)}${r.f8 ? "" : ` <span class="tag soft">not in article master</span>`}</td><td class="r num">${fmt(r.plan)}</td><td class="r num">${r.mins}m</td><td class="num">${r.kg != null ? r.kg.toFixed(3) + " kg" : "–"}</td><td>${esc(r.tray || "–")}</td><td class="num">${r.shelf != null ? r.shelf + " d" : "–"}</td><td class="num">${esc(r.tpnb || "–")}</td><td><span class="rs ${st}">${st === "done" ? "Done" : st === "now" ? "Running" : "To come"}</span>${st === "now" ? `<div class="bar"><div class="fill" style="width:${prog}%;background:var(--plan)"></div></div>` : ""}</td></tr>`;
  }).join("");
  const jumps = o.jumps.map(j => `${tm(j.s)} ${esc(j.desc)}`).join(" · ");
  return `<section class="card"><div class="label">Schedule · <b>${rs.length}</b> runs · <b class="num">${fmt(o.planDay)}</b> packs planned<span class="go">${done} done${now ? ` · now ${esc(now.sap)}` : ""}</span></div>
    <div class="tscroll"><table class="stab"><thead><tr><th>Planned</th><th>SAP code</th><th>Description</th><th class="r">Plan packs</th><th class="r">Run</th><th>Pack weight</th><th>Tray</th><th>Shelf life</th><th>TPNB</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${jumps ? `<div class="hint" style="margin-top:calc(var(--u)*1)">Crew moves on the schedule: ${jumps}</div>` : ""}</section>`;
}
function lineHead(o, h, tab) {
  const ar = areaById(o.area), ls = linesOf(ar), i = ls.indexOf(o);
  const prev = ls[(i - 1 + ls.length) % ls.length], next = ls[(i + 1) % ls.length];
  const s = streak(o, h);
  const tabs = [["overview", "bars", "Overview"], ["floor", "tvs", "Floor screen"], ["sheet", "sheet", "SIC sheet"]].map(([t, icn, lbl]) => `<a class="${t === tab ? "on" : ""}" href="${route("line/" + o.no, t)}"${t === tab ? ' aria-current="page"' : ""}>${ic(icn)}${lbl}</a>`).join("");
  return `<section class="card lhead">
    <span class="lv-title">Line ${o.no}</span>
    <div class="lv-meta"><span class="chip"><b>${o.areaName}</b> · ${esc(o.sub)}</span>${o.has ? `<span class="chip">Crew <b>${o.crew}</b></span><span class="chip">First crate <b class="num">${fcTxt(o, h)}</b></span><span class="chip"><b>${o.arts}</b> articles</span><span class="chip">Runs <b class="num">${o.start}–${o.end}</b></span>${o.hasPlan ? `<span class="chip">Plan <b class="num">${fmt(o.planDay)}</b> packs · <b>${o.runs.length}</b> runs</span>` : `<span class="chip">Not on the schedule</span>`}` : `<span class="chip">No production recorded</span>`}${s >= 2 ? `<span class="tag ${s >= 3 ? "site" : "am"}">Escalate to ${s >= 3 ? "site" : "area manager"} · red ${s} h</span>` : ""}</div>
    <div class="lv-nav"><nav class="seg" aria-label="Line views">${tabs}</nav><a class="iconbtn" href="${route("line/" + prev.no, tab)}" aria-label="Previous line, L${prev.no}" title="L${prev.no} ([)">${ic("chevL")}</a><a class="iconbtn" href="${route("line/" + next.no, tab)}" aria-label="Next line, L${next.no}" title="L${next.no} (])">${ic("chevR")}</a></div>
  </section>`;
}
function lineOverview(o, h) {
  const c = cum(o, h), lh = lostHours([o], h, 8);
  return `<div class="lo-grid">
      <section class="card"><div class="label">${status(o, h) === "run" ? "This hour" : "Hour"} · <b class="num">${hrLbl(h)}</b></div>${hourCard(o, h, false)}</section>
      <section class="card"><div class="label">Shift so far</div>${sofarCard(o, h)}</section>
      <section class="card mincard"><div class="label">Where the minutes went · <b class="num">${fmt(c.av + c.pln + c.uns + c.off)}</b> clock min</div>${minsDetail(c)}</section>
    </div>
    ${tiles(o, h)}
    ${scheduleCard(o, h)}
    ${chartCard(o, h)}
    <div class="row3">
      <section class="card"><div class="label">Biggest lost hours so far</div><div class="lh-list">${lh.length ? lh.map(x => lhItem(x, false)).join("") : `<div class="empty">Nothing over 5 minutes yet.</div>`}</div></section>
      ${plansCard(o, h)}
      <section class="card"><div class="label">Quality so far</div><div class="stats" style="margin-top:calc(var(--u)*.6)"><div class="stat num"><small>Giveaway</small>${c.gpc.toFixed(2)}<em>%</em></div><div class="stat num"><small>Over weight</small>${f1(c.gkg)}<em>kg</em></div><div class="stat num"><small>Rejects</small>${fmt(c.rej)}<em>packs</em></div></div><div class="hint" style="margin-top:auto;padding-top:calc(var(--u)*1.6)">Giveaway is fixed-weight packs over declared weight. Whole day: ${o.gwPct.toFixed(2)}%, ${f1(o.gwKg)} kg, ${fmt(o.rejDay)} rejects.</div></section>
    </div>`;
}
function tvBand(title, meta, h, endLbl) {
  return `<header class="tvband"><span class="t">${title}</span><div class="m">${meta}</div><div class="clock num"><small>${endLbl ? "End of shift" : "As at"}</small>${endLbl || pad(h + 1) + ":00"}</div></header>`;
}
const tvFoot = left => `<footer class="tvfoot"><span>${left}</span><span><span class="cnt G">${sh("G")}95%+</span> <span class="cnt A">${sh("A")}85–95%</span> <span class="cnt R">${sh("R")}under 85%</span> <span class="cnt N">${sh("N")}not rated</span></span></footer>`;
function floorScreen(o, h) {
  const band = tvBand(`LINE ${o.no}`, `<span><b>${META.dateLabel.replace(" 2026", "")}</b></span>${o.has ? `<span>Crew <b>${o.crew}</b></span><span>First crate <b class="num">${fcTxt(o, h)}</b></span>` : ""}<span>${o.areaName} · ${esc(o.sub)}</span>`, h, o.has && h >= o.last ? o.end : "");
  if (!o.has) return band + `<div class="card" style="flex:1;align-items:center;justify-content:center"><div class="fs-kpi">No production</div><div class="fs-sub">Nothing recorded on Line ${o.no} for ${META.dateLabel}</div></div>` + tvFoot("Source: curated.vSIC_Hourly");
  const c = cum(o, h), st = status(o, h), lostAsk = c.unx >= 1;
  const tot = c.coded + c.unx || 1;
  return band + `<div class="fs">
    <div class="fs-main">
      <section class="card"><div class="label">${st === "run" ? (h >= o.last ? "Last hour" : "This hour") : "Hour"} <b class="num">${hrS(h)}</b></div>${hourCard(o, h, true)}</section>
      <section class="card"><div class="label">${h >= o.last ? "Shift total" : "Shift so far"}</div>${sofarCard(o, h)}</section>
    </div>
    ${tiles(o, h)}
    <div class="fs-low">
      <section class="card"><div class="label">Lost time</div><div class="fs-lost"><div><div class="fs-kpi num">${fmt(c.lost)}<small>min</small></div><div class="stack"><i style="width:${(c.coded / tot * 100).toFixed(1)}%;background:var(--stop)"></i><i style="width:${(c.unx / tot * 100).toFixed(1)}%;background:var(--gap)"></i></div><div class="fs-sub num">${fmt(c.coded)} min with a reason</div></div>
        <div class="fs-ask" style="${lostAsk ? "" : "border-color:var(--g)"}">${lostAsk ? `<b class="num">${fmt(c.unx)} min have no reason</b><span>Write the reason on the SIC sheet</span>` : `<b style="color:var(--g-ink)">Every minute has a reason</b><span>Keep logging stops in Omega</span>`}</div></div></section>
      <section class="card"><div class="label">Giveaway</div><div class="fs-kpi num">${c.gpc.toFixed(2)}<small>%</small></div><div class="fs-sub num">${f1(c.gkg)} kg over weight</div></section>
      <section class="card"><div class="label">Rejects</div><div class="fs-kpi num">${fmt(c.rej)}</div><div class="fs-sub">packs so far</div></section>
      <section class="card"><div class="label">Hours</div><div class="fs-kpi num" style="font-size:calc(var(--u)*5)">${counts({G: c.G, A: c.A, R: c.R, N: c.N}, false)}</div><div class="fs-sub">green · amber · red${c.N ? ` · ${c.N} not rated` : ""}</div></section>
    </div></div>` + tvFoot("Source: curated.vSIC_Hourly · target = best shift for the line and product × minutes available");
}

/* ---------- SIC sheet ---------- */
const KEY = (o, h, f) => `sic|${META.date}|${o.no}|${h}|${f}`;
const val = k => store.get(k, "");
function fld(k, need, ph, cls = "", label = "") {
  const v = val(k);
  return `<input class="fld ${cls}${v ? " filled" : need ? " need" : ""}" data-k="${esc(k)}" data-need="${need ? 1 : 0}" value="${esc(v)}" placeholder="${need ? esc(ph) : ""}" aria-label="${esc(label || ph)}">`;
}
function todoList(o, h) {
  const rows = o.hs.filter(k => k <= h).map(k => o.H[k]);
  const items = [];
  const crew = val(`sic|${META.date}|${o.no}|crew`);
  items.push([!!crew, crew ? `Crew actual written: ${esc(crew)}.` : "Crew actual in the header. Omega holds no labour figure."]);
  const shortH = rows.filter(x => x.rag === "R" || x.rag === "A");
  const missA = shortH.filter(x => !val(KEY(o, x.h, "act")) || !val(KEY(o, x.h, "who")));
  items.push([shortH.length > 0 && missA.length === 0, shortH.length ? (missA.length ? `Action and owner on ${missA.length} of ${shortH.length} hours under 95%: ${missA.map(x => hrS(x.h)).join(", ")}.` : `Action and owner written on all ${shortH.length} hours under 95%.`) : "No hours under 95% so far."]);
  const unc = rows.filter(x => x.unx >= 5), missR = unc.filter(x => !val(KEY(o, x.h, "why")));
  items.push([unc.length > 0 && missR.length === 0, unc.length ? (missR.length ? `A reason for minutes Omega has no stop for, in ${missR.length} hours: ${missR.map(x => `${hrS(x.h)} (${f1(x.unx)} min)`).join(", ")}.` : "Reasons written for every hour with unlogged minutes.") : "Every lost minute has a stop logged."]);
  const fail = rows.filter(x => x.loss === "Failure"), missH = fail.filter(x => !val(KEY(o, x.h, "hc")));
  if (fail.length) items.push([missH.length === 0, missH.length ? `Help called and arrived for the breakdowns at ${missH.map(x => hrS(x.h)).join(", ")}, if an engineer was called.` : "Help times written for every breakdown hour."]);
  items.push([false, "Batch yield, until the yield feed is built."]);
  return items.map(([d, t]) => `<li${d ? ' class="done"' : ""}>${d ? "✓ " : ""}${t}</li>`).join("");
}
function sicSheet(o, h) {
  if (!o.has) return emptyLine(o);
  const c = cum(o, h), rc = ragOf(c.a, c.t), pc = pct(c.a, c.t), crewK = `sic|${META.date}|${o.no}|crew`;
  let run = 0, runT = 0;
  const rows = o.hs.map(k => {
    const x = o.H[k]; run += x.a; runT += x.t;
    if (k > h) return `<tr class="fut"><td class="hr num">${hrS(k)}</td><td class="prod">${x.sched.length ? `<b class="num">${esc(x.sched[0].r.sap)}</b> <span class="pd2">${prodShort(x.sched[0].r.desc)}</span>` : ""}</td><td class="r num">${x.plan != null ? fmt(x.plan) : ""}</td><td colspan="13">To come</td></tr>`;
    const v = x.a - x.t, short = x.rag === "R" || x.rag === "A";
    const seg = (w, col, t) => w > .05 ? `<i style="width:${(w / 60 * 100).toFixed(2)}%;background:${col}" title="${t}: ${f1(w)} min"></i>` : "";
    const bar = seg(Math.max(0, x.av - x.lost), "var(--blue)", "At target rate") + seg(x.coded, "var(--stop)", "Logged stop") + seg(x.unx, "var(--gap)", "No reason logged") + seg(x.pln, "var(--planned)", "Planned") + seg(x.off + x.uns, "var(--off)", x.uns ? "No shift" : "Not started");
    let mt = x.lost > 0 ? `<b>${x.lost}</b> lost` : "none lost";
    if (x.stop >= .5) mt += `, ${f1(x.stop)} stopped`;
    mt += ` · ${f1(x.av)} available`;
    let iss = "";
    if (x.items.length) iss += `<span class="om"><span class="tg">Omega</span>${reasonTxt(x)}</span>`;
    if (x.plans.length) iss += `<span class="pl">Planned: ${planTxt(x)}${x.note ? " · " + esc(x.note) : ""}</span>`;
    if (x.unx >= 5) iss += fld(KEY(o, k, "why"), true, `Reason for ${f1(x.unx)} min`, "", `Reason for ${f1(x.unx)} unlogged minutes at ${hrS(k)}`);
    const rag = x.rag !== "N" ? `<span class="rag ${x.rag}" title="${WORD[x.rag]}">${x.rag}</span>` : `<span class="rag N" title="Under 10 minutes available">–</span>`;
    const fail = x.loss === "Failure";
    return `<tr class="${x.rag === "R" ? "rR" : x.rag === "A" ? "rA" : ""}">
      <td class="hr num">${hrS(k)}</td>
      <td class="prod"${x.sched.length > 1 ? ` data-tip="${esc(`<b>Scheduled ${hrS(k)}</b><br>${x.sched.map(s => `${esc(s.r.sap)} ${prodShort(s.r.desc)} <span class='tg'>${tm(Math.max(s.r.s, k * 60) % 1440)}–${tm(Math.min(s.r.e, k * 60 + 60) % 1440)}</span>`).join("<br>")}`)}"` : ""}>${x.sched.length ? `<b class="num">${esc(x.sched[0].r.sap)}</b> <span class="pd2">${prodShort(x.sched[0].r.desc)}</span>${x.sched.length > 1 ? ` <span class="more2">+${x.sched.length - 1} more</span>` : ""}` : `<span style="color:var(--muted)">Not on the schedule</span>`}<small>Omega ${esc(x.prod || "–")}${x.n > 1 ? ` +${x.n - 1}` : ""}</small></td>
      <td class="r num">${x.plan != null ? fmt(x.plan) : "–"}</td>
      <td class="r num">${fmt(x.t)}</td><td class="r num"><b>${fmt(x.a)}</b></td>
      <td class="r num ${v >= 0 ? "pos" : "neg"}">${v >= 0 ? "+" : "−"}${fmt(Math.abs(v))}</td>
      <td class="r num">${x.t > 0 ? pct(x.a, x.t) : "–"}</td><td>${rag}</td>
      <td class="r num">${fmt(run)}<br><span style="color:var(--muted)">${fmt(runT)}</span></td>
      <td class="r num">${x.gpc != null ? x.gpc.toFixed(2) + "%" : "–"}<br><span style="color:var(--muted)">${x.gkg != null ? f1(x.gkg) + " kg" : ""}</span></td>
      <td><div class="mcell"><div class="mbar">${bar}</div><span class="mtxt num">${mt}</span></div></td>
      <td class="issue">${iss}</td>
      <td>${short ? fld(KEY(o, k, "act"), true, "Write action", "", `Containment action at ${hrS(k)}`) : fld(KEY(o, k, "act"), false, "", "", `Note at ${hrS(k)}`)}</td>
      <td>${fld(KEY(o, k, "who"), short, "Who", "t", `Owner at ${hrS(k)}`)}</td>
      <td>${fld(KEY(o, k, "when"), short, "When", "t", `By when at ${hrS(k)}`)}</td>
      <td><div class="helpc">${fld(KEY(o, k, "hc"), fail, "Called", "t", `Help called at ${hrS(k)}`)}${fld(KEY(o, k, "ha"), fail, "Arrived", "t", `Help arrived at ${hrS(k)}`)}</div></td>
    </tr>`;
  }).join("");
  const ragChips = ["G", "A", "R"].map(k => `<span class="rchip ${k}">${c[k]} ${WORD[k]}</span>`).join("") + (c.N ? `<span class="rchip N">${c.N} not rated</span>` : "");
  return `<div class="sheet-wrap">
    <div class="phead noprint"><div><h1>SIC sheet</h1><p>Line ${o.no} · ${META.dateLabel} · ${asAt(h)} · what you write saves in this browser</p></div>
      <div class="acts"><button class="btn" type="button" data-act="print">${ic("print")}Print</button><button class="btn" type="button" data-act="csv">${ic("download")}Export CSV</button><button class="btn" type="button" data-act="clear">${ic("trash")}Clear my entries</button></div></div>
    <section class="sheet" aria-label="SIC sheet header">
      <div class="bar2"><h2>SIC · Line ${o.no}</h2><span>${META.siteName} · ${o.areaName} · ${esc(o.sub)} · from the Omega feed in HiltonMoa</span></div>
      <div class="boxes">
        <div class="box"><span class="k">Line</span><span class="bv">${o.no}</span><span class="gn">${o.areaName} · ${esc(o.sub)}</span></div>
        <div class="box"><span class="k">Date</span><span class="bv">${META.dateLabel.replace(" 2026", "")}</span><span class="gn">Runs ${o.start} to ${o.end}</span></div>
        <div class="box"><span class="k">Shift</span><div class="crewc">${["A", "B"].map(k => `<i class="${k === o.crew ? "on" : ""}">${k}</i>`).join("")}</div><span class="gn">From the rota</span></div>
        <div class="box"><span class="k">Crew</span><div class="pair"><div><small>Plan</small><b>–</b></div><div><small>Actual</small>${fld(crewK, true, "Write", "t", "Crew actual")}</div></div><span class="gn">Not held in Omega</span></div>
        <div class="box"><span class="k">First crate</span><div class="pair"><div><small>Plan</small><b>–</b></div><div><small>Actual</small><b class="num">${fcTxt(o, h)}</b></div></div><span class="gn">From the first rollup</span></div>
        <div class="box"><span class="k">Plan</span><span class="bv num">${o.hasPlan ? fmt(o.planDay) : "–"}</span><span class="gn">${o.hasPlan ? `${o.runs.length} runs · schedule saved 3 Nov` : "Not on the schedule"}</span></div>
      </div>
    </section>
    <section class="sstrip" aria-label="Shift so far">
      <div class="stile lead"><span class="k">${h >= o.last ? "Shift total" : "Shift so far"} · packs v target${o.hasPlan ? ` · ${pct(c.planA, c.plan)}% v plan` : ""}</span><span class="n num">${pc ?? "–"}%</span><span class="d num">${fmt(c.a)} packs against ${fmt(c.t)}, ${shortTxt(c.t, c.a).replace(/<[^>]+>/g, "")}</span><div class="bar" style="margin-top:6px"><div class="fill ${rc}" style="width:${Math.min(100, pc || 0)}%"></div></div></div>
      <div class="stile"><span class="k">Lost time</span><span class="n num">${fmt(c.lost)} min</span><span class="d num">${fmt(c.coded)} min to logged stops, ${fmt(c.unx)} min with no reason</span></div>
      <div class="stile"><span class="k">Giveaway</span><span class="n num">${f1(c.gkg)} kg</span><span class="d num">${c.gpc.toFixed(2)}% over declared weight</span></div>
      <div class="stile"><span class="k">Rejected packs</span><span class="n num">${fmt(c.rej)}</span><span class="d">Omega reject count</span></div>
      <div class="stile"><span class="k">Hours by RAG</span><div class="ragrow">${ragChips}</div><span class="d">Green at 95% of target or above</span></div>
    </section>
    ${chartCard(o, h)}
    <section class="sgrid" aria-label="Hour by hour"><table>
      <thead><tr><th>Hour</th><th>Product<span class="src">scheduled SAP code, then the Omega article</span></th><th class="r">Plan<span class="src">schedule</span></th><th class="r">Target<span class="src">best shift</span></th><th class="r">Actual<span class="src">packs</span></th><th class="r">+/−</th><th class="r">%</th><th>RAG</th><th class="r">Running<span class="src">actual / target</span></th><th class="r">Giveaway<span class="src">% and kg</span></th><th>Where the 60 minutes went<span class="src">lost at the target rate</span></th><th>Issue<span class="src">Omega stop, or the reason to write</span></th><th class="ll">Containment / action<span class="src">line leader</span></th><th class="ll">Who</th><th class="ll">By when</th><th class="ll">Help called / arrived</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td class="hr">${h >= o.last ? "Shift" : "So far"}</td><td>${c.hrs} hours</td><td class="r num">${o.hasPlan ? fmt(c.plan) : "–"}</td><td class="r num">${fmt(c.t)}</td><td class="r num">${fmt(c.a)}</td><td class="r num ${c.a >= c.t ? "pos" : "neg"}">${c.a >= c.t ? "+" : "−"}${fmt(Math.abs(c.a - c.t))}</td><td class="r num">${pc ?? "–"}</td><td></td><td></td><td class="r num">${c.gpc.toFixed(2)}%<br><span style="color:var(--muted)">${f1(c.gkg)} kg</span></td><td class="num">${fmt(c.lost)} lost, ${fmt(c.unx)} no reason</td><td colspan="5"></td></tr></tfoot>
    </table></section>
    <section class="card"><div class="legend">${minLegend()}</div></section>
    <section class="notes">
      <div class="card"><h3>Still to write on this sheet</h3><ul id="todo">${todoList(o, h)}</ul></div>
      <div class="card"><h3>How to read it</h3><ul>
        <li>Target is the best shift: the best day rate for the line and product (on two or more days), else the best day for the line, times the minutes available in the hour. It comes from the days loaded so far, so it moves as history builds.</li>
        <li>Breaks, cleaning, changes and no-shift come off the available minutes, so they never count as lost. A short hour can read over 100% for that reason.</li>
        <li>Lost minutes are the available minutes the packs do not cover at the target rate. When Omega has no stop for them, they need a reason written here.</li>
        <li>Product is the SAP code and description from the production schedule for that hour, with the Omega article number under it. Omega does not send the SAP code, so the two are shown side by side rather than matched.</li><li>Plan is the scheduler's packs for the hour. Target is the best shift. The two can differ: the plan is set by the scheduler, the target by the line's own record.</li>
      </ul></div>
    </section>
    <p class="hint">Source: ${META.source}, extracted ${META.extracted}. Plan and products are from the F12 schedule. Crew, yield and the line leader columns are not in any feed yet; entries you type here stay in this browser only.</p>
  </div>`;
}
function exportCsv(o) {
  const q = s => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const head = ["Line", "Date", "Hour", "ScheduledSAP", "ScheduledDescription", "PlanPacks", "OmegaArticle", "Articles", "Target", "Actual", "Diff", "Pct", "RAG", "GiveawayKg", "GiveawayPct", "Rejects", "LostMins", "StopMins", "NoReasonMins", "PlannedMins", "AvailableMins", "OmegaStops", "Planned", "ReasonWritten", "Action", "Who", "ByWhen", "HelpCalled", "HelpArrived"];
  const lines = [head.join(",")];
  for (const k of o.hs) {
    const x = o.H[k];
    lines.push([o.no, META.date, hrS(k), q(x.sched.map(s => s.r.sap).join("; ")), q(x.sched.map(s => s.r.desc).join("; ")), x.plan ?? "", x.prod, x.n, x.t, x.a, x.a - x.t, x.t > 0 ? pct(x.a, x.t) : "", x.rag, x.gkg ?? "", x.gpc ?? "", x.rej, x.lost, x.stop, x.unx, x.pln, x.av, q(x.items.map(i => `${i.name} ${i.mins}m`).join("; ")), q(x.plans.map(i => `${i.name} ${i.mins}m`).join("; ")), q(val(KEY(o, k, "why"))), q(val(KEY(o, k, "act"))), q(val(KEY(o, k, "who"))), q(val(KEY(o, k, "when"))), q(val(KEY(o, k, "hc"))), q(val(KEY(o, k, "ha")))].join(","));
  }
  const blob = new Blob(["﻿" + lines.join("\r\n")], {type: "text/csv"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `SIC Line ${o.no} ${META.date}.csv`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  toast(`Exported the SIC sheet for Line ${o.no}`);
}

let prodQ = "", prodSort = ["line", 1];
function productsView(h) {
  const q = prodQ.trim().toLowerCase().split(/\s+/).filter(Boolean);
  let rs = ALLRUNS.filter(({o, r}) => q.every(w => `${r.sap} ${r.desc} l${o.no} line ${o.no} ${o.sub} ${o.areaName} ${r.tray} ${r.tpnb}`.toLowerCase().includes(w)));
  const [k, dir] = prodSort;
  const key = {line: x => x.o.no * 100000 + x.r.s, sap: x => x.r.sap, desc: x => x.r.desc.toLowerCase(), time: x => x.r.s, plan: x => x.r.plan, kg: x => x.r.kg ?? 0, shelf: x => x.r.shelf ?? 0}[k];
  rs = rs.slice().sort((a, b) => { const p = key(a), r2 = key(b); return (p > r2 ? 1 : p < r2 ? -1 : 0) * dir; });
  const saps = new Set(ALLRUNS.map(x => x.r.sap)).size, lines = new Set(ALLRUNS.map(x => x.o.no)).size;
  const th = (id, lbl, cls = "") => `<th class="${cls}"><button type="button" class="sortb${k === id ? " on" : ""}" data-sort="${id}">${lbl}${k === id ? (dir > 0 ? " ▲" : " ▼") : ""}</button></th>`;
  const rows = rs.map(({o, r}) => { const st = runState(r, h); return `<tr class="st-${st}"><td><a class="lnk" href="${route("line/" + o.no, "overview")}">L${o.no}</a> <small>${esc(o.sub)}</small></td><td><span class="sap">${esc(r.sap)}</span></td><td class="pdesc">${esc(r.desc)}${r.f8 ? "" : ` <span class="tag soft">not in article master</span>`}</td><td class="num">${tm(r.s % 1440)}–${tm(r.e % 1440)}</td><td class="r num">${fmt(r.plan)}</td><td class="num">${r.kg != null ? r.kg.toFixed(3) + " kg" : "–"}</td><td>${esc(r.tray || "–")}</td><td class="num">${r.shelf != null ? r.shelf + " d" : "–"}</td><td class="num">${esc(r.tpnb || "–")}</td><td><span class="rs ${st}">${st === "done" ? "Done" : st === "now" ? "Running" : "To come"}</span></td></tr>`; }).join("");
  return `<div class="view v-prod">${pageHead("Products on the schedule", `${saps} SAP codes · ${ALLRUNS.length} runs · ${lines} lines · ${META.dateLabel} · status ${asAt(h)}`)}
    <section class="card"><div class="pfilter"><span class="pf-in">${ic("search")}<input id="prodq" type="search" placeholder="Filter by SAP code, description, line or tray…" value="${esc(prodQ)}" aria-label="Filter products"></span><span class="hint num">${rs.length} of ${ALLRUNS.length} runs</span></div>
    <div class="tscroll"><table class="stab ptab"><thead><tr>${th("line", "Line")}${th("sap", "SAP code")}${th("desc", "Description")}${th("time", "Planned")}${th("plan", "Plan packs", "r")}${th("kg", "Pack weight")}<th>Tray</th>${th("shelf", "Shelf life")}<th>TPNB</th><th>Status</th></tr></thead><tbody>${rows || `<tr><td colspan="10" class="empty">No runs match.</td></tr>`}</tbody></table></div>
    <div class="hint" style="margin-top:calc(var(--u)*1.2)">From the F12 production schedule (${esc(META.schedule)}), with pack weight and shelf life from the F8 article master. Lines 15 and 23 are not on the schedule.</div></section>
  </div>`;
}
function emptyLine(o) {
  const near = linesOf(areaById(o.area)).filter(x => x.has && x.sub === o.sub);
  return `<section class="card emptyst">${ic("bars")}<h2>No production on Line ${o.no}</h2><p>Omega sent no hourly rollups for Line ${o.no} on ${META.dateLabel}, so there is nothing to show for the shift.</p><div class="acts">${near.map(x => `<a class="btn" href="${route("line/" + x.no, state.tab)}">Line ${x.no}</a>`).join("")}<a class="btn" href="${route("area/" + o.area, "overview")}">${o.areaName} area</a></div></section>`;
}
function viewLine(o, h, tab) {
  let body;
  if (tab === "floor") body = `<div class="phead"><div><h1>Floor screen</h1><p>The screen above Line ${o.no}, ${asAt(h)}. Show on TV opens it full screen.</p></div><div class="acts">${tvBtn}</div></div><div class="tvframe"><div class="tv dark-scope">${floorScreen(o, h)}</div></div>`;
  else if (tab === "sheet") body = sicSheet(o, h);
  else body = o.has ? lineOverview(o, h) : emptyLine(o);
  return `<div class="view v-line">${lineHead(o, h, tab)}${body}</div>`;
}
function kioskView() {
  const [kind, id] = state.path.split("/"), h = state.h;
  if (kind === "line") return floorScreen(L[id], h);
  if (kind === "area") { const ar = areaById(id); return tvBand(`${ar.name.toUpperCase()} AREA`, `<span><b>${META.siteName}</b></span><span>${META.dateLabel.replace(" 2026", "")}</span><span>Crew <b>${META.crew}</b></span>`, h, "") + viewArea(ar, h, true) + tvFoot(`${RULE} (proposed)`); }
  return tvBand("HFI DROGHEDA", `<span><b>Site</b> · all lines</span><span>${META.dateLabel.replace(" 2026", "")}</span><span>Crew <b>${META.crew}</b></span>`, h, "") + viewSite(h, true) + tvFoot(`${RULE} (proposed)`);
}

/* ---------- routing and state ---------- */
const state = {path: "site", tab: "overview", h: DEFAULT_H, kiosk: false};
const main = $("#main"), shell = $("#shell");
function route(p = state.path, tab) {
  if (tab === undefined) tab = p === state.path ? state.tab : "overview";
  const t = p.startsWith("line/") && tab && tab !== "overview" ? "/" + tab : "";
  return `#/${p}${t}?h=${state.h}${state.kiosk ? "&tv=1" : ""}`;
}
const lineHref = o => route("line/" + o.no, state.path.startsWith("line/") ? state.tab : "overview");
function parseHash() {
  const m = location.hash.match(/^#\/([^?]*)(?:\?(.*))?$/);
  const q = new URLSearchParams(m && m[2] || "");
  const parts = (m ? m[1] : "site").split("/").filter(Boolean);
  let path = "site", tab = "overview";
  if (parts[0] === "products") path = "products";
  else if (parts[0] === "area" && areaById(parts[1])) path = "area/" + parts[1];
  else if (parts[0] === "line" && L[parts[1]]) { path = "line/" + parts[1]; tab = ["floor", "sheet"].includes(parts[2]) ? parts[2] : "overview"; }
  state.path = path; state.tab = tab;
  const h = parseInt(q.get("h"), 10);
  if (h >= FIRST_H && h <= LAST_H) state.h = h;
  const tv = q.get("tv") === "1";
  if (tv !== state.kiosk) setKiosk(tv, false);
}
let lastKey = "";
function render() {
  const [kind, id] = state.path.split("/"), h = state.h;
  let html;
  if (state.kiosk) html = `<div class="tvframe"><div class="tv dark-scope">${kioskView()}</div></div>`;
  else if (kind === "area") html = viewArea(areaById(id), h);
  else if (kind === "line") html = viewLine(L[id], h, state.tab);
  else if (kind === "products") html = productsView(h);
  else html = viewSite(h);
  const key = state.path + "|" + state.tab + "|" + state.kiosk;
  const keepScroll = key === lastKey ? main.scrollTop : 0;
  main.innerHTML = html;
  main.scrollTop = keepScroll;
  if (key !== lastKey && !state.kiosk) main.scrollTop = 0;
  lastKey = key;
  renderNav(); renderTop(); fit(); hideTip();
  const o = kind === "line" ? L[id] : null;
  document.title = `SIC Live · ${o ? `Line ${o.no}${state.tab === "floor" ? " · Floor screen" : state.tab === "sheet" ? " · SIC sheet" : ""}` : kind === "area" ? areaById(id).name + " area" : kind === "products" ? "Products" : "Site"} · ${hrS(h)}`;
}
function renderNav() {
  const h = state.h, [kind, id] = state.path.split("/");
  const navI = (p, icon, label, rail, g, on) => { const r = ragOf(g.a, g.t); return `<a class="nav-i${on ? " on" : ""}" href="${route(p, "overview")}"${on ? ' aria-current="page"' : ""} title="${esc(label)}">${icon}<span class="lbl">${label}</span>${rail ? `<span class="rail">${rail}</span>` : ""}<span class="nav-x ${r} num">${pct(g.a, g.t) ?? "–"}%</span></a>`; };
  let s = `<div class="nav-sec"><div class="nav-h">Overview</div>${navI("site", ic("site"), "Site", "", agg(ALL, h), kind === "site")}<a class="nav-i${kind === "products" ? " on" : ""}" href="${route("products", "overview")}"${kind === "products" ? ' aria-current="page"' : ""} title="Products on the schedule">${ic("box")}<span class="lbl">Products</span><span class="rail">SKU</span><span class="nav-x num">${new Set(ALLRUNS.map(x => x.r.sap)).size}</span></a></div>`;
  s += `<div class="nav-sec"><div class="nav-h">Areas</div>${AREAS.map(ar => navI("area/" + ar.id, ic("area"), ar.name, ar.name.slice(0, 3), agg(linesOf(ar), h), kind === "area" && id === ar.id)).join("")}</div>`;
  s += `<div class="nav-sec"><div class="nav-h">Lines</div>`;
  for (const ar of AREAS) {
    s += `<div class="nav-g"><span>${ar.name}</span></div>`;
    for (const o of linesOf(ar)) {
      const st = status(o, h), c = cum(o, h), on = kind === "line" && +id === o.no;
      const dot = st === "run" ? o.H[h].rag : "idle";
      const p = o.has && st !== "pre" ? pct(c.a, c.t) : null;
      s += `<a class="nav-i line${on ? " on" : ""}" href="${lineHref(o)}"${on ? ' aria-current="page"' : ""} title="Line ${o.no} · ${esc(o.sub)}${st === "run" ? " · this hour " + WORD[o.H[h].rag].toLowerCase() : ""}"><span class="dot ${dot}"></span><span class="lbl">L${o.no}<small>${esc(o.sub)}</small></span><span class="rail">L${o.no}</span>${p != null ? `<span class="nav-x ${ragOf(c.a, c.t)} num">${p}%</span>` : `<span class="nav-x">${o.has ? "–" : "no data"}</span>`}</a>`;
    }
  }
  $("#nav").innerHTML = s + `</div>`;
}
function renderTop() {
  const [kind, id] = state.path.split("/"), h = state.h;
  let cr;
  if (kind === "area") cr = `<a href="${route("site", "overview")}">Site</a><span class="sep">/</span><span class="cur">${areaById(id).name} area</span>`;
  else if (kind === "line") { const o = L[id]; cr = `<a href="${route("site", "overview")}">Site</a><span class="sep">/</span><a href="${route("area/" + o.area, "overview")}">${o.areaName}</a><span class="sep">/</span><span class="cur">Line ${o.no}${state.tab === "floor" ? " · Floor screen" : state.tab === "sheet" ? " · SIC sheet" : ""}</span>`; }
  else if (kind === "products") cr = `<a href="${route("site", "overview")}">Site</a><span class="sep">/</span><span class="cur">Products</span>`;
  else cr = `<span class="cur">Site overview</span>`;
  $("#crumbs").innerHTML = cr;
  $("#hlbl").textContent = hrLbl(h);
  $("#hsub").textContent = h >= LAST_H ? "End of day" : `As at ${pad(h + 1)}:00`;
  $("#hrange").value = h;
  $("#hprev").disabled = h <= FIRST_H; $("#hnext").disabled = h >= LAST_H;
  $("#kbl").textContent = `${hrLbl(h)}${rotT ? " · rotating" : ""}`;
}
function setHour(h, quiet) {
  state.h = Math.max(FIRST_H, Math.min(LAST_H, h));
  history.replaceState(null, "", route());
  render();
}
const go = (p, tab) => { location.hash = route(p, tab); };

/* ---------- sizing ---------- */
function fit() {
  if (!state.kiosk) {
    const w = main.clientWidth - 48;
    document.documentElement.style.setProperty("--u", Math.max(7.2, Math.min(8.6, w / 200)).toFixed(2) + "px");
  }
  for (const tv of $$(".tv", main)) {
    let w;
    if (state.kiosk) { w = Math.min(innerWidth, innerHeight * 16 / 9); tv.style.height = (w * 9 / 16) + "px"; }
    else {
      w = tv.parentElement.clientWidth;
      const top = tv.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop;
      const avail = main.clientHeight - top - 28;
      if (avail > 360 && w * 9 / 16 > avail) w = avail * 16 / 9;
      tv.style.height = "";
    }
    tv.style.width = w + "px";
    tv.style.setProperty("--u", (w / 177.78).toFixed(3) + "px");
  }
}
new ResizeObserver(() => fit()).observe(main);
addEventListener("resize", fit);

/* ---------- kiosk, replay, rotate ---------- */
let repT = null, rotT = null, idleT = null;
const ROTATION = ["site", "area/fresh", "area/cured", "area/other"];
function setKiosk(on, user = true) {
  state.kiosk = on;
  document.body.classList.toggle("kiosk", on);
  $("#kbar").hidden = !on;
  if (on && user && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
  if (!on) { if (rotT) toggleRotate(); if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); }
  if (user) { history.replaceState(null, "", route()); render(); if (on) toast("TV mode. Press Esc or K to leave, R to rotate screens."); }
  poke();
}
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && state.kiosk) setKiosk(false); });
function toggleReplay() {
  if (repT) { clearInterval(repT); repT = null; }
  else {
    if (state.h >= LAST_H) setHour(FIRST_H);
    repT = setInterval(() => { if (state.h >= LAST_H) { toggleReplay(); return; } setHour(state.h + 1); }, 2200);
    toast("Replaying the day, one hour every 2 seconds");
  }
  const b = $("#replay"); b.setAttribute("aria-pressed", repT ? "true" : "false"); b.innerHTML = ic(repT ? "pause" : "play"); b.title = repT ? "Stop the replay (Space)" : "Replay the day (Space)";
}
function toggleRotate() {
  if (rotT) { clearInterval(rotT); rotT = null; }
  else { rotT = setInterval(() => { const i = ROTATION.indexOf(state.path); go(ROTATION[(i + 1) % ROTATION.length], "overview"); }, 15000); toast("Rotating site and areas every 15 seconds"); }
  $("#krot").setAttribute("aria-pressed", rotT ? "true" : "false");
  renderTop();
}
function poke() {
  const k = $("#kbar"); k.classList.remove("idle");
  clearTimeout(idleT);
  if (state.kiosk) idleT = setTimeout(() => k.classList.add("idle"), 2600);
}
addEventListener("pointermove", poke);

/* ---------- theme ---------- */
const THEMES = ["auto", "light", "dark"];
function applyTheme(t) {
  if (t === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", t);
  const b = $("#themebtn"); b.innerHTML = ic(t === "light" ? "sun" : t === "dark" ? "moon" : "auto");
  b.title = `Theme: ${t === "auto" ? "follows the computer" : t} (T)`; b.setAttribute("aria-label", b.title);
}
let theme = store.get("sic.theme", "auto");
if (!THEMES.includes(theme)) theme = "auto";
applyTheme(theme);
function cycleTheme() { theme = THEMES[(THEMES.indexOf(theme) + 1) % 3]; store.set("sic.theme", theme); applyTheme(theme); toast(`Theme: ${theme === "auto" ? "follows the computer" : theme}`); }

/* ---------- tooltip, toast ---------- */
const tip = $("#tip");
function hideTip() { tip.classList.remove("on"); }
function posTip(x, y) {
  const r = tip.getBoundingClientRect();
  let l = x + 14, t = y + 16;
  if (l + r.width > innerWidth - 8) l = x - r.width - 14;
  if (t + r.height > innerHeight - 8) t = y - r.height - 12;
  tip.style.left = Math.max(8, l) + "px"; tip.style.top = Math.max(8, t) + "px";
}
document.addEventListener("pointerover", e => {
  const t = e.target.closest && e.target.closest("[data-tip]");
  if (!t) { hideTip(); return; }
  tip.innerHTML = t.getAttribute("data-tip"); tip.classList.add("on"); posTip(e.clientX, e.clientY);
});
document.addEventListener("pointermove", e => { if (tip.classList.contains("on")) posTip(e.clientX, e.clientY); });
main.addEventListener("scroll", hideTip, {passive: true});
function toast(msg) {
  const el = document.createElement("div"); el.className = "toast"; el.textContent = msg;
  $("#toasts").appendChild(el); setTimeout(() => el.remove(), 3200);
}

/* ---------- command palette ---------- */
const pal = $("#palette"), palq = $("#palq"), pallist = $("#pallist");
let palItems = [], palSel = 0;
function palAll() {
  const it = [{g: "Screens", icon: "site", t: "Site overview", k: "site all lines home", run: () => go("site", "overview")}];
  for (const ar of AREAS) it.push({g: "Screens", icon: "area", t: `${ar.name} area`, s: ar.subs.map(x => x[0]).join(", "), k: ar.name + " area " + ar.subs.map(x => x[0]).join(" "), run: () => go("area/" + ar.id, "overview")});
  for (const o of ALL) {
    const base = `line l${o.no} ${o.no} ${o.sub} ${o.areaName}`;
    it.push({g: "Lines", icon: "bars", t: `Line ${o.no}`, s: `${o.areaName} · ${o.sub}`, k: base + " overview", run: () => go("line/" + o.no, "overview")});
    if (o.has) {
      it.push({g: "Lines", icon: "tvs", t: `Line ${o.no} · Floor screen`, s: "TV above the line", k: base + " floor screen tv", run: () => go("line/" + o.no, "floor")});
      it.push({g: "Lines", icon: "sheet", t: `Line ${o.no} · SIC sheet`, s: "Hour by hour, with actions", k: base + " sic sheet actions", run: () => go("line/" + o.no, "sheet")});
    }
  }
  it.push({g: "Screens", icon: "box", t: "Products on the schedule", k: "products sap codes descriptions schedule", run: () => go("products", "overview")});
  const seen = new Set();
  for (const {o, r} of ALLRUNS) { const kk = r.sap + "|" + o.no; if (seen.has(kk)) continue; seen.add(kk); it.push({g: "Products", icon: "box", t: `${r.sap} · ${r.desc}`, s: `Line ${o.no} · ${tm(r.s % 1440)}`, k: `${r.sap} ${r.desc} line ${o.no} l${o.no}`, run: () => { state.h = Math.max(FIRST_H, Math.min(LAST_H, Math.floor(r.s / 60))); go("line/" + o.no, "overview"); }}); }
  it.push({g: "Actions", icon: "tv", t: "Show on TV", s: "K", k: "tv kiosk full screen", run: () => setKiosk(true)});
  it.push({g: "Actions", icon: "play", t: "Replay the day", s: "Space", k: "replay play", run: toggleReplay});
  it.push({g: "Actions", icon: "chevsR", t: "Jump to the end of the day", s: "End", k: "end last hour", run: () => setHour(LAST_H)});
  it.push({g: "Actions", icon: "chevsL", t: "Jump to 06:00", s: "Home", k: "start first hour", run: () => setHour(FIRST_H)});
  it.push({g: "Actions", icon: "auto", t: "Change the theme", s: "T", k: "theme dark light", run: cycleTheme});
  it.push({g: "Actions", icon: "info", t: "How it works and shortcuts", s: "?", k: "help shortcuts keys", run: openHelp});
  return it;
}
function palRender() {
  const q = palq.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  palItems = palAll().filter(i => q.length ? q.every(w => (i.t + " " + (i.k || "")).toLowerCase().includes(w)) : i.g !== "Products").slice(0, 60);
  palSel = Math.min(palSel, Math.max(0, palItems.length - 1));
  let g = "", s = "";
  palItems.forEach((i, n) => { if (i.g !== g) { g = i.g; s += `<div class="pal-g">${g}</div>`; } s += `<div class="pal-i${n === palSel ? " sel" : ""}" role="option" data-n="${n}" aria-selected="${n === palSel}">${ic(i.icon)}<span>${esc(i.t)}</span>${i.s ? `<small>${esc(i.s)}</small>` : ""}</div>`; });
  pallist.innerHTML = s || `<div class="pal-g">Nothing matches</div>`;
  const sel = $(".pal-i.sel", pallist); if (sel) sel.scrollIntoView({block: "nearest"});
}
function openPalette() { if (pal.open) return; palq.value = ""; palSel = 0; palRender(); pal.showModal(); palq.focus(); }
function runPal(n) { const i = palItems[n]; if (!i) return; pal.close(); i.run(); }
palq.addEventListener("input", () => { palSel = 0; palRender(); });
palq.addEventListener("keydown", e => {
  if (e.key === "ArrowDown") { e.preventDefault(); palSel = Math.min(palItems.length - 1, palSel + 1); palRender(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); palSel = Math.max(0, palSel - 1); palRender(); }
  else if (e.key === "Enter") { e.preventDefault(); runPal(palSel); }
});
pallist.addEventListener("click", e => { const i = e.target.closest(".pal-i"); if (i) runPal(+i.dataset.n); });
pal.addEventListener("click", e => { if (e.target === pal) pal.close(); });

/* ---------- help ---------- */
const help = $("#help");
function openHelp() {
  $("#helpBody").innerHTML = `
    <h3>The numbers</h3><ul>
      <li><b>Target</b> is the best shift: the best day rate for the line and product on two or more days, else the best day for the line, times the minutes available in the hour.</li>
      <li><b>RAG</b> is set each hour: green at 95% of target or more, amber 85 to 95%, red under 85%. An hour with under 10 minutes available is not rated.</li>
      <li><b>Lost minutes</b> are the available minutes the packs do not cover at the target rate. Breaks, cleaning, changes and no-shift come off the available minutes first.</li>
      <li><b>No reason logged</b> is lost time with no stop in Omega. The line leader writes the reason on the SIC sheet.</li>
      <li><b>Escalation</b> (proposed): ${RULE.toLowerCase()}. Hours that are not rated are skipped.</li>
      <li><b>Giveaway</b> is fixed-weight packs over declared weight. The hour picker moves every figure, including giveaway and rejects, to the hour you choose.</li></ul>
    <h3>Products and plan</h3><ul>
      <li>SAP codes, descriptions and plan packs come from the F12 production schedule for the day. Pack weight and shelf life come from the F8 article master.</li>
      <li>Omega's article number is not linked to the SAP code in any feed, so each hour shows the product scheduled for that hour with the Omega article next to it. Matching them properly needs the Omega article ID adding to the F8 extract.</li>
      <li><b>Packs v plan</b> compares actual packs with the scheduler's plan for lines that are on the schedule; <b>v target</b> compares with the best shift.</li></ul>
    <h3>Data</h3><ul>
      <li>${META.source}, ${META.siteName}, ${META.dateLabel}, extracted ${META.extracted}. Every hour reconciles to the line's shift totals in the view.</li>
      <li>Not in the feed yet: crew, plan packs, yield and article names. Line 3 has no production for the day and Line 23 is not in the area lookup.</li>
      <li>What you type on a SIC sheet stays in this browser. The live version would write it back to the database.</li></ul>
    <h3>Shortcuts</h3><div class="keys">
      <span class="kbd">/</span><span>Find a line or screen</span>
      <span><span class="kbd">←</span> <span class="kbd">→</span></span><span>Previous or next hour (Home and End jump)</span>
      <span class="kbd">Space</span><span>Replay the day</span>
      <span><span class="kbd">S</span> <span class="kbd">F</span> <span class="kbd">C</span> <span class="kbd">O</span> <span class="kbd">P</span></span><span>Site, Fresh, Cured, Other, Products</span>
      <span><span class="kbd">1</span> <span class="kbd">2</span> <span class="kbd">3</span></span><span>Line overview, floor screen, SIC sheet</span>
      <span><span class="kbd">[</span> <span class="kbd">]</span></span><span>Previous or next line</span>
      <span class="kbd">K</span><span>TV mode, full screen (R rotates, Esc leaves)</span>
      <span class="kbd">T</span><span>Theme</span>
      <span class="kbd">?</span><span>This help</span></div>`;
  if (!help.open) help.showModal();
}
help.addEventListener("click", e => { if (e.target === help) help.close(); });

/* ---------- events ---------- */
document.addEventListener("click", e => {
  const b = e.target.closest("[data-act]");
  if (!b) { if (shell.classList.contains("drawer") && !e.target.closest(".side")) shell.classList.remove("drawer"); return; }
  const a = b.dataset.act, [kind, id] = state.path.split("/");
  if (a === "kiosk") setKiosk(!state.kiosk);
  else if (a === "theme") cycleTheme();
  else if (a === "palette") openPalette();
  else if (a === "help") openHelp();
  else if (a === "closehelp") help.close();
  else if (a === "hprev") setHour(state.h - 1);
  else if (a === "hnext") setHour(state.h + 1);
  else if (a === "hend") setHour(LAST_H);
  else if (a === "replay") toggleReplay();
  else if (a === "rotate") toggleRotate();
  else if (a === "menu") shell.classList.toggle("drawer");
  else if (a === "collapse") { shell.classList.toggle("collapsed"); store.set("sic.side", shell.classList.contains("collapsed") ? "1" : ""); setCollapseIcon(); setTimeout(fit, 0); }
  else if (a === "print") window.print();
  else if (a === "csv" && kind === "line") exportCsv(L[id]);
  else if (a === "clear" && kind === "line") {
    const o = L[id];
    if (!confirm(`Clear everything you typed on the Line ${o.no} SIC sheet in this browser?`)) return;
    const pre = `sic|${META.date}|${o.no}|`;
    try { Object.keys(localStorage).filter(k => k.startsWith(pre)).forEach(k => localStorage.removeItem(k)); } catch (err) {}
    render(); toast(`Cleared your entries for Line ${o.no}`);
  }
});
document.addEventListener("click", e => { if (e.target.closest(".nav a")) shell.classList.remove("drawer"); });
main.addEventListener("input", e => {
  const f = e.target.closest(".fld"); if (!f) return;
  store.set(f.dataset.k, f.value.trim());
  f.classList.toggle("filled", !!f.value.trim());
  f.classList.toggle("need", !f.value.trim() && f.dataset.need === "1");
  const [kind, id] = state.path.split("/"), td = $("#todo");
  if (td && kind === "line") td.innerHTML = todoList(L[id], state.h);
});
$("#hrange").addEventListener("input", e => setHour(+e.target.value));
main.addEventListener("input", e => { if (e.target.id !== "prodq") return; prodQ = e.target.value; const pos = e.target.selectionStart; render(); const q2 = $("#prodq"); if (q2) { q2.focus(); q2.setSelectionRange(pos, pos); } });
main.addEventListener("click", e => { const b = e.target.closest("[data-sort]"); if (!b) return; const id = b.dataset.sort; prodSort = prodSort[0] === id ? [id, -prodSort[1]] : [id, 1]; render(); });
document.addEventListener("keydown", e => {
  const typing = e.target.closest && e.target.closest("input, textarea, select, [contenteditable]");
  if (e.key === "Escape") { if (state.kiosk) { setKiosk(false); return; } if (shell.classList.contains("drawer")) shell.classList.remove("drawer"); if (typing && e.target.classList.contains("fld")) e.target.blur(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); return; }
  if (typing || e.ctrlKey || e.metaKey || e.altKey || pal.open || help.open) return;
  const k = e.key, [kind, id] = state.path.split("/");
  if (k === "/") { e.preventDefault(); openPalette(); }
  else if (k === "?") openHelp();
  else if (k === "ArrowLeft") { e.preventDefault(); setHour(state.h - 1); }
  else if (k === "ArrowRight") { e.preventDefault(); setHour(state.h + 1); }
  else if (k === "Home") setHour(FIRST_H);
  else if (k === "End") setHour(LAST_H);
  else if (k === " ") { e.preventDefault(); toggleReplay(); }
  else if (k === "k" || k === "K") setKiosk(!state.kiosk);
  else if ((k === "r" || k === "R") && state.kiosk) toggleRotate();
  else if (k === "t" || k === "T") cycleTheme();
  else if (k === "s" || k === "S") go("site", "overview");
  else if (k === "f" || k === "F") go("area/fresh", "overview");
  else if (k === "c" || k === "C") go("area/cured", "overview");
  else if (k === "o" || k === "O") go("area/other", "overview");
  else if (k === "p" || k === "P") go("products", "overview");
  else if (kind === "line" && ["1", "2", "3"].includes(k)) go(state.path, ["overview", "floor", "sheet"][+k - 1]);
  else if (kind === "line" && (k === "[" || k === "]")) { const o = L[id], ls = linesOf(areaById(o.area)), i = ls.indexOf(o); go("line/" + ls[(i + (k === "]" ? 1 : -1) + ls.length) % ls.length].no, state.tab); }
});
addEventListener("hashchange", () => { parseHash(); render(); });

/* ---------- start ---------- */
function setCollapseIcon() { const c = shell.classList.contains("collapsed"); const b = $(".brand .collapse"); b.innerHTML = ic(c ? "chevsR" : "chevsL"); b.title = c ? "Expand the sidebar" : "Collapse the sidebar"; b.setAttribute("aria-label", b.title); }
$$("[data-ic]").forEach(el => { el.outerHTML = ic(el.dataset.ic); });
if (store.get("sic.side", "") === "1") shell.classList.add("collapsed");
setCollapseIcon();
$("#brandSub").textContent = META.siteName;
$("#datechip").innerHTML = `<b>${META.dateLabel}</b>Crew ${META.crew} · ${withData(ALL).length} lines`;
$("#status").innerHTML = `<span class="live"></span><div><b>${META.dateLabel}</b>curated.vSIC_Hourly · extracted ${META.extracted.replace("Wed ", "")}</div>`;
$("#replay").innerHTML = ic("play");
parseHash();
if (!/^#\//.test(location.hash)) history.replaceState(null, "", route());
render();
