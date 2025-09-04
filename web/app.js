/* ============================================================================
 * Threat Graph MVP — Frontend (D3 v7)
 * - Force-directed layout (frozen after initial settle)
 * - Side panel with node details + neighbors
 * - Search & focus, export PNG/JSON, legend
 * - Optional organizer (grid/radial) helpers
 * ==========================================================================*/

/* ----------------------------- Global state ------------------------------ */
let sim = null;
let svg, g, width, height;
let linkSel, nodeSel, labelSel;

window.__rawGraph = null;
let graphCache = { nodes: [], links: [] };
let selectedNode = null;
let neighborIdx = null;

// layout flags
let isFrozen = false;  // do not re-activate forces
let gridLaid = false;  // initial grid positions already applied

/* ----------------------------- UI elements ------------------------------ */
let elGraph, elBtn, elLog, elLegend, elThresh, elThVal;
let elSearch, elSearchBtn, elResetBtn, elExportPng, elExportJson;
let elLayoutBtn;                 // legacy organize button inside #graph (optional)
let elFab, elChkOrganize;        // optional floating switch (if you re-add it)

/* ------------------------------- Utilities ------------------------------ */
function log(msg) {
  if (!elLog) return;
  elLog.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + elLog.textContent;
}
function currentMode() {
  const r = document.querySelector('input[name="mode"]:checked');
  return r ? r.value : 'static';
}
function metricKey() {
  return currentMode() === 'temporal' ? 'pr_temporal_percent' : 'pr_percent';
}
const toNumber = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* ------------------------------- Palette -------------------------------- */
const PALETTE = {
  domain: '#3B82F6',
  ip:     '#06B6D4',
  cert:   '#F59E0B',
  hash:   '#EF4444',
  other:  '#6B7280'
};
function colorByType(t) {
  return PALETTE[(t || '').toLowerCase()] || PALETTE.other;
}

/* ------------------------------ SVG + Sim ------------------------------- */
function initSVG() {
  elGraph = document.getElementById('graph');
  width   = elGraph.clientWidth  || 1200;
  height  = elGraph.clientHeight || 700;

  svg = d3.select('#graph').append('svg')
    .attr('width', width)
    .attr('height', height);

  g = svg.append('g');
  svg.call(d3.zoom().on('zoom', ev => g.attr('transform', ev.transform)));
}

function ensureSim() {
  if (sim) return;
  sim = d3.forceSimulation()
    .force('link', d3.forceLink().id(d => d.id).distance(55).strength(0.22))
    .force('charge', d3.forceManyBody().strength(-95))
    .force('collision', d3.forceCollide().radius(d => 6 + Math.sqrt(toNumber(d[metricKey()]))).strength(0.9))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .alpha(1).alphaDecay(0.1).alphaMin(0.001);
}

/* --------------------------- Filter / Normalize -------------------------- */
function filterGraph(raw) {
  const t = Number(elThresh?.value) || 0;
  const m = metricKey();

  const nodes = (raw.nodes || []).map(n => ({
    ...n,
    pr_percent:          toNumber(n.pr_percent),
    pr_temporal_percent: toNumber(n.pr_temporal_percent)
  }));
  const kept   = nodes.filter(n => toNumber(n[m]) >= t);
  const keepId = new Set(kept.map(n => n.id));

  const rawLinks = raw.links || raw.edges || [];
  const links = rawLinks
    .map(e => ({ source: e.source ?? e.src, target: e.target ?? e.dst }))
    .filter(e => keepId.has(e.source) && keepId.has(e.target));

  return { nodes: kept, links };
}

/* ------------------------- Neighbors / Highlight ------------------------- */
function buildNeighborIndex(links) {
  const idx = new Map();
  links.forEach(l => {
    const s = l.source.id ?? l.source;
    const t = l.target.id ?? l.target;
    if (!idx.has(s)) idx.set(s, { out: new Set(), in: new Set() });
    if (!idx.has(t)) idx.set(t, { out: new Set(), in: new Set() });
    idx.get(s).out.add(t); idx.get(t).in.add(s);
  });
  return idx;
}
function dimAll() {
  nodeSel?.classed('dimmed', false).classed('selected', false);
  linkSel?.classed('dimmed', false);
  labelSel?.classed('dimmed', false);
}
function highlightSelection(node) {
  if (!nodeSel || !linkSel) return;
  if (!node) { dimAll(); return; }

  const id = node.id;
  const neighs = neighborIdx.get(id) || { out: new Set(), in: new Set() };
  const keep = new Set([id, ...neighs.out, ...neighs.in]);

  nodeSel.classed('dimmed', d => !keep.has(d.id)).classed('selected', d => d.id === id);
  labelSel.classed('dimmed', d => !keep.has(d.id));
  linkSel.classed('dimmed', d => {
    const s = d.source.id ?? d.source, t = d.target.id ?? d.target;
    return !(s === id || t === id);
  });
}

/* ----------------------------- Side panel ------------------------------- */
const panel = {
  el: null, title: null, type: null, label: null, pr: null, prt: null, last: null, neigh: null, btnClose: null
};
function initPanel() {
  panel.el    = document.getElementById('sidepanel');
  panel.title = document.getElementById('sp-title');
  panel.type  = document.getElementById('sp-type');
  panel.label = document.getElementById('sp-label');
  panel.pr    = document.getElementById('sp-pr');
  panel.prt   = document.getElementById('sp-prt');
  panel.last  = document.getElementById('sp-last');
  panel.neigh = document.getElementById('sp-neighbors');
  panel.btnClose = document.getElementById('sp-close');
}
function openPanel(d) {
  selectedNode = d;
  panel.title.textContent = d.label || d.id;
  panel.type.textContent  = d.t || d.type || '-';
  panel.label.textContent = d.label || d.id;
  panel.pr.textContent    = (toNumber(d.pr_percent)).toFixed(3) + ' %';
  panel.prt.textContent   = (toNumber(d.pr_temporal_percent)).toFixed(3) + ' %';
  panel.last.textContent  = d.last_seen || '-';

  const id = d.id, neighs = neighborIdx.get(id) || { out: new Set(), in: new Set() };
  const out = [...neighs.out], inc = [...neighs.in];
  const byId = new Map(graphCache.nodes.map(n => [n.id, n]));
  const li = (nid) => {
    const n = byId.get(nid); if (!n) return '';
    const t = (n.t || n.type || '').toLowerCase();
    const cls = t ? `badge-${t}` : '';
    return `<li><span>${n.label || n.id}</span><span class="badge ${cls}">${t || '-'}</span></li>`;
  };
  panel.neigh.innerHTML = out.map(li).join('') + inc.map(li).join('');

  panel.btnClose.onclick = clearSelection;
  document.addEventListener('keydown', e => { if (e.key === 'Escape') clearSelection(); }, { once: true });
  panel.el.style.display = 'block';
}
function clearSelection() {
  selectedNode = null;
  dimAll();
  panel.el.style.display = 'none';
}

/* -------------------------- Node sizing / layout ------------------------- */
function sizeScaleFor(graph) {
  const m = metricKey();
  const max = d3.max(graph.nodes, d => toNumber(d[m])) || 1;
  return d3.scaleSqrt().domain([0, max]).range([5, 28]);
}

/** Initial grid to reduce heavy overlaps before freezing the sim. */
function applyInitialGrid(nodes) {
  const cols = Math.max(1, Math.floor(Math.sqrt(nodes.length)));
  const rows = Math.ceil(nodes.length / cols);

  const cellW = Math.max(160, width / (cols + 0.5));
  const cellH = Math.max(160, height / (rows + 0.5));

  nodes.forEach((n, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    n.x = 80 + c * cellW + Math.random() * 20;
    n.y = 80 + r * cellH + Math.random() * 20;
    n.vx = n.vy = 0;
  });
  gridLaid = true;
}

/* ----------------------------- Freeze sim -------------------------------- */
function freezeSimulation() {
  if (!sim) return;
  for (let i = 0; i < 120; i++) sim.tick(); // settle a bit more
  sim.alpha(0);
  isFrozen = true;
}

/* ----------------------------- Organizer --------------------------------- */
/** Connected components from current links. */
function connectedComponents(nodes, links) {
  const idSet = new Set(nodes.map(n => n.id));
  const adj = new Map();
  nodes.forEach(n => adj.set(n.id, new Set()));
  links.forEach(l => {
    const s = l.source.id ?? l.source, t = l.target.id ?? l.target;
    if (idSet.has(s) && idSet.has(t)) {
      adj.get(s).add(t); adj.get(t).add(s);
    }
  });
  const seen = new Set();
  const comps = [];
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    const q = [n.id]; seen.add(n.id);
    const comp = [];
    while (q.length) {
      const v = q.shift(); comp.push(v);
      for (const u of adj.get(v)) {
        if (!seen.has(u)) { seen.add(u); q.push(u); }
      }
    }
    comps.push(comp);
  }
  return comps;
}

/** Simple radial (layered BFS) layout for a component. */
function radialLayoutForComponent(compIds, graph, centerX, centerY) {
  const m = metricKey();
  const byId = new Map(graph.nodes.map(n => [n.id, n]));
  const adj = new Map();
  compIds.forEach(id => adj.set(id, { out: new Set(), in: new Set() }));
  graph.links.forEach(l => {
    const s = l.source.id ?? l.source, t = l.target.id ?? l.target;
    if (adj.has(s) && adj.has(t)) { adj.get(s).out.add(t); adj.get(t).out.add(s); }
  });

  // root = node with highest current metric
  let rootId = compIds[0];
  for (const id of compIds) {
    if (toNumber(byId.get(id)[m]) > toNumber(byId.get(rootId)[m])) rootId = id;
  }

  // BFS layers
  const dist = new Map([[rootId, 0]]);
  const q = [rootId];
  while (q.length) {
    const v = q.shift();
    for (const u of adj.get(v).out) {
      if (!dist.has(u)) { dist.set(u, dist.get(v) + 1); q.push(u); }
    }
  }

  // group by layer
  const layers = [];
  for (const id of compIds) {
    const d = dist.get(id) ?? 0;
    if (!layers[d]) layers[d] = [];
    layers[d].push(id);
  }

  // place nodes
  const ringStep = 42; // px between rings
  layers.forEach((ids, layer) => {
    const R = layer * ringStep;
    const k = Math.max(1, ids.length);
    ids.forEach((id, i) => {
      const angle = (2 * Math.PI * i) / k;
      const n = byId.get(id);
      n.x = centerX + (layer === 0 ? 0 : R * Math.cos(angle));
      n.y = centerY + (layer === 0 ? 0 : R * Math.sin(angle));
    });
  });
}

/** Organize all components in a grid, each component laid out radially. */
function organizeGraph() {
  if (!graphCache.nodes?.length) return;

  const comps = connectedComponents(graphCache.nodes, graphCache.links);
  const m = metricKey();
  const byId = new Map(graphCache.nodes.map(n => [n.id, n]));

  const scored = comps.map(ids => {
    let best = 0;
    ids.forEach(id => { best = Math.max(best, toNumber(byId.get(id)[m])); });
    return { ids, score: best };
  }).sort((a, b) => b.score - a.score);

  const cols  = Math.max(1, Math.ceil(Math.sqrt(scored.length)));
  const cellW = Math.max(260, width / cols);
  const cellH = 220;

  scored.forEach((c, idx) => {
    const r = Math.floor(idx / cols), col = idx % cols;
    const cx = col * cellW + cellW / 2;
    const cy = r * cellH + cellH / 2 + 20;
    radialLayoutForComponent(c.ids, graphCache, cx, cy);
  });

  // refresh positions and freeze
  linkSel
    .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
    .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
  nodeSel.attr('cx', d => d.x).attr('cy', d => d.y);
  labelSel.attr('x', d => d.x + 8).attr('y', d => d.y + 3);

  if (sim) sim.alpha(0);
  isFrozen = true;

  // reset optional switch
  if (elChkOrganize) elChkOrganize.checked = false;
}

/* --------------------------------- Draw ---------------------------------- */
function drawGraph(graph) {
  ensureSim();
  graphCache = graph;
  neighborIdx = buildNeighborIndex(graph.links);

  if (!gridLaid) applyInitialGrid(graph.nodes);

  // LINKS
  linkSel = g.selectAll('.link').data(graph.links, d => {
    const s = d.source.id ?? d.source, t = d.target.id ?? d.target;
    return `${s}->${t}`;
  });
  linkSel.exit().remove();
  linkSel = linkSel.enter().append('line')
    .attr('class', 'link')
    .attr('stroke', '#b3c0d1')
    .attr('stroke-width', 1)
    .merge(linkSel);

  const sizeScale = sizeScaleFor(graph);
  const mKey = metricKey();

  // NODES
  nodeSel = g.selectAll('.node').data(graph.nodes, d => d.id);
  nodeSel.exit().remove();
  const nodeEnter = nodeSel.enter().append('circle')
    .attr('class', 'node')
    .attr('r', d => sizeScale(toNumber(d[mKey])))
    .attr('fill', d => colorByType(d.t || d.type || 'other'))
    .on('click', (ev, d) => { ev.stopPropagation(); openPanel(d); highlightSelection(d); });

  // drag without waking up the global forces
  nodeEnter.call(
    d3.drag()
      .on('start', (ev, d) => { d.fx = d.x; d.fy = d.y; })
      .on('drag', (ev, d) => {
        d.fx = ev.x; d.fy = ev.y;
        linkSel
          .attr('x1', l => ( (l.source.id ?? l.source) === d.id ? d.fx : l.source.x ))
          .attr('y1', l => ( (l.source.id ?? l.source) === d.id ? d.fy : l.source.y ))
          .attr('x2', l => ( (l.target.id ?? l.target) === d.id ? d.fx : l.target.x ))
          .attr('y2', l => ( (l.target.id ?? l.target) === d.id ? d.fy : l.target.y ));
        nodeSel.filter(n => n.id === d.id).attr('cx', d.fx).attr('cy', d.fy);
        labelSel.filter(n => n.id === d.id).attr('x', d.fx + 8).attr('y', d.fy + 3);
      })
      .on('end', (ev, d) => { d.x = d.fx; d.y = d.fy; d.fx = null; d.fy = null; })
  );

  nodeEnter.append('title').text(d => `${d.label || d.id}`);
  nodeSel = nodeEnter.merge(nodeSel);

  // LABELS (inline so they are included in PNG export)
  labelSel = g.selectAll('.node-label').data(graph.nodes, d => d.id);
  labelSel.exit().remove();
  const labelEnter = labelSel.enter().append('text')
    .attr('class', 'node-label')
    .attr('fill', '#F9FAFB')
    .attr('font-size', 12)
    .attr('font-family', 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif')
    .text(d => d.label || d.id);
  labelSel = labelEnter.merge(labelSel);

  // clicking on the canvas clears the selection
  svg.on('click', () => clearSelection());

  // Simulation wiring
  sim.nodes(graph.nodes);
  sim.force('link').links(graph.links);

  sim.on('tick', () => {
    if (isFrozen) return;
    linkSel
      .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    nodeSel
      .attr('cx', d => d.x).attr('cy', d => d.y);
    labelSel
      .attr('x', d => d.x + 8)
      .attr('y', d => d.y + 3);
  });

  // settle once and freeze
  isFrozen = false;
  sim.alpha(0.6);
  for (let i = 0; i < 60; i++) sim.tick();
  linkSel
    .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
    .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
  nodeSel.attr('cx', d => d.x).attr('cy', d => d.y);
  labelSel.attr('x', d => d.x + 8).attr('y', d => d.y + 3);
  freezeSimulation();

  // optional organizer controls
  if (elLayoutBtn) { elLayoutBtn.disabled = false; elLayoutBtn.style.display = 'block'; }
  if (elFab)       { elFab.classList.remove('hidden'); }

  renderLegend();
}

/* -------------------------------- Legend --------------------------------- */
function renderLegend() {
  if (!elLegend) return;
  elLegend.innerHTML =
    `<b>Leyenda</b><br>` +
    [
      ['domain', PALETTE.domain],
      ['ip',     PALETTE.ip],
      ['cert',   PALETTE.cert],
      ['hash',   PALETTE.hash]
    ].map(([name, color]) =>
      `<div style="display:flex;align-items:center;gap:8px;margin:2px 0;">
         <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color}"></span>
         <span>${name}</span>
       </div>`
    ).join('');
}

function render() {
  if (!window.__rawGraph) return;
  gridLaid = false;
  drawGraph(filterGraph(window.__rawGraph));
}

/* ------------------------------ Export JSON ------------------------------ */
function exportJSON() {
  if (!graphCache?.nodes?.length) return;
  const data = { nodes: graphCache.nodes, links: graphCache.links };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'subgraph.json'; a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------ Export PNG ------------------------------- */
async function exportPNG() {
  if (!svg) return;
  const clone = svg.node().cloneNode(true);

  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', '0'); bg.setAttribute('y', '0');
  bg.setAttribute('width', String(width)); bg.setAttribute('height', String(height));
  bg.setAttribute('fill', '#0D1117');
  clone.insertBefore(bg, clone.firstChild);

  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = `
    .link { stroke: #9CA3AF; stroke-opacity: .6; }
    .node { stroke: #0B0F14; stroke-width: 1.2px; }
    .node-label { fill: #F9FAFB; font-size: 12px; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
  `;
  clone.insertBefore(style, clone.firstChild);

  const s = new XMLSerializer().serializeToString(clone);
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);

  const img = new Image();
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');

  await new Promise(res => {
    img.onload = () => { ctx.drawImage(img, 0, 0); res(); };
    img.src = url;
  });

  canvas.toBlob(b => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = 'graph.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 500);
  });
}

/* -------------------------------- Backend -------------------------------- */
async function generate() {
  if (elBtn) { elBtn.disabled = true; elBtn.textContent = 'Generando…'; }
  try {
    log('[POST] /api/generate …');
    const r = await fetch('/api/generate', { method: 'POST' });
    if (!r.ok) throw new Error('POST /api/generate failed: ' + r.status);

    log('[OK] Loading /api/graph …');
    const res  = await fetch('/api/graph', { cache: 'no-store' });
    const json = await res.json();
    window.__rawGraph = json;
    log(`Graph loaded: ${json.nodes.length} nodes, ${(json.links?.length ?? json.edges?.length) || 0} edges.`);
    render();
  } catch (e) {
    console.error(e);
    log('Error: ' + (e?.message || String(e)));
  } finally {
    if (elBtn) { elBtn.disabled = false; elBtn.textContent = 'Generar grafo'; }
  }
}

/* ---------------------------- Search & focus ----------------------------- */
function bfsComponent(startId, links) {
  const nbr = neighborIdx || buildNeighborIndex(links);
  const seen = new Set([startId]);
  const q = [startId];
  while (q.length) {
    const v = q.shift();
    const n = nbr.get(v) || { out: new Set(), in: new Set() };
    for (const u of [...n.out, ...n.in]) {
      if (!seen.has(u)) { seen.add(u); q.push(u); }
    }
  }
  return seen;
}

function searchAndFocus() {
  const q = (elSearch.value || '').trim().toLowerCase();
  if (!q || !graphCache.nodes.length) return;

  const match = graphCache.nodes.find(n =>
    (n.id || '').toLowerCase() === q ||
    (n.label || '').toLowerCase() === q
  );
  if (!match) { log('Not found'); return; }

  const comp = bfsComponent(match.id, graphCache.links);
  nodeSel.classed('dimmed', d => !comp.has(d.id));
  labelSel.classed('dimmed', d => !comp.has(d.id));
  linkSel.classed('dimmed', d => {
    const s = d.source.id ?? d.source, t = d.target.id ?? d.target;
    return !(comp.has(s) && comp.has(t));
  });

  const k = 1.6;
  const t = d3.zoomIdentity.translate(width / 2 - (match.x || 0) * k, height / 2 - (match.y || 0) * k).scale(k);
  svg.transition().duration(500).call(d3.zoom().transform, t);
}

function resetView() {
  dimAll();
  svg.transition().duration(300).call(d3.zoom().transform, d3.zoomIdentity);
}

/* --------------------------------- Boot ---------------------------------- */
document.addEventListener('DOMContentLoaded', () => {
  // DOM cache
  elGraph  = document.getElementById('graph');
  elBtn    = document.getElementById('btn-generate');
  elLog    = document.getElementById('log');
  elLegend = document.getElementById('legend');
  elThresh = document.getElementById('threshold');
  elThVal  = document.getElementById('thresVal');

  elSearch     = document.getElementById('search-input');
  elSearchBtn  = document.getElementById('btn-search');
  elResetBtn   = document.getElementById('btn-reset');
  elExportPng  = document.getElementById('btn-export-png');
  elExportJson = document.getElementById('btn-export-json');
  elLayoutBtn  = document.getElementById('btn-layout'); // may not exist

  // optional floating switch (if you re-add it in HTML)
  elFab         = document.getElementById('fab-organize') || null;
  elChkOrganize = document.getElementById('chk-organize') || null;

  // initial state for organizer controls
  if (elLayoutBtn) { elLayoutBtn.style.display = 'none'; elLayoutBtn.disabled = true; }
  if (elFab)       { elFab.classList.add('hidden'); }
  if (elChkOrganize) {
    elChkOrganize.checked = false;
    elChkOrganize.addEventListener('change', () => {
      if (elChkOrganize.checked) organizeGraph();
    });
  }

  initPanel();
  initSVG();

  document.getElementById('btn-generate')?.addEventListener('click', generate);
  document.querySelectorAll('input[name="mode"]').forEach(r => r.addEventListener('change', render));

  elThresh?.addEventListener('input', () => {
    if (elThVal) elThVal.textContent = (Number(elThresh.value) || 0).toFixed(1);
    render();
  });

  elSearchBtn?.addEventListener('click', searchAndFocus);
  elSearch?.addEventListener('keydown', e => { if (e.key === 'Enter') searchAndFocus(); });
  elResetBtn?.addEventListener('click', resetView);

  elExportPng?.addEventListener('click', exportPNG);
  elExportJson?.addEventListener('click', exportJSON);

  // legacy organize button
  elLayoutBtn?.addEventListener('click', organizeGraph);
});
