/* 軽量SVGチャート(依存ライブラリなし)
   - 折れ線: クロスヘア + 全系列ツールチップ
   - 横棒: マーク単位のホバーツールチップ */
"use strict";

const Charts = (() => {
  const tooltip = () => document.getElementById("chart-tooltip");

  function showTooltip(x, y, titleText, rows) {
    const tt = tooltip();
    tt.innerHTML = "";
    const title = document.createElement("div");
    title.className = "tt-title";
    title.textContent = titleText;
    tt.appendChild(title);
    for (const r of rows) {
      const row = document.createElement("div");
      row.className = "tt-row";
      const key = document.createElement("span");
      key.className = "tt-key";
      key.style.background = r.color;
      const val = document.createElement("span");
      val.className = "tt-val";
      val.textContent = r.value;
      const name = document.createElement("span");
      name.className = "tt-name";
      name.textContent = r.name;
      row.append(key, val, name);
      tt.appendChild(row);
    }
    tt.hidden = false;
    const rect = tt.getBoundingClientRect();
    let left = x + 14, top = y + 14;
    if (left + rect.width > window.innerWidth - 8) left = x - rect.width - 14;
    if (top + rect.height > window.innerHeight - 8) top = y - rect.height - 14;
    tt.style.left = left + "px";
    tt.style.top = top + "px";
  }
  function hideTooltip() { tooltip().hidden = true; }

  function niceTicks(max, count = 4) {
    const rough = max / count;
    const pow = Math.pow(10, Math.floor(Math.log10(rough)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) || rough;
    const top = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
    return { top, ticks };
  }

  const NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  /* 複数系列の折れ線チャート
     opts: { labels:[], series:[{name,color,values:[]}], height, format(v) } */
  function line(container, opts) {
    const { labels, series, format = (v) => String(v) } = opts;
    const H = opts.height || 240;
    const W = 640;
    const pad = { top: 14, right: 16, bottom: 26, left: 52 };
    const iw = W - pad.left - pad.right;
    const ih = H - pad.top - pad.bottom;

    const maxV = Math.max(...series.flatMap((s) => s.values));
    const { top, ticks } = niceTicks(maxV);
    const x = (i) => pad.left + (labels.length === 1 ? iw / 2 : (i / (labels.length - 1)) * iw);
    const y = (v) => pad.top + ih - (v / top) * ih;

    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });

    // gridlines + y ticks(ヘアライン・実線)
    for (const t of ticks) {
      svg.appendChild(el("line", { x1: pad.left, x2: W - pad.right, y1: y(t), y2: y(t), stroke: "var(--grid)", "stroke-width": 1 }));
      const txt = el("text", { x: pad.left - 8, y: y(t) + 4, "text-anchor": "end", "font-size": 10.5, fill: "var(--text-muted)", style: "font-variant-numeric: tabular-nums" });
      txt.textContent = t.toLocaleString("ja-JP");
      svg.appendChild(txt);
    }
    // baseline
    svg.appendChild(el("line", { x1: pad.left, x2: W - pad.right, y1: y(0), y2: y(0), stroke: "var(--baseline)", "stroke-width": 1 }));
    // x labels
    labels.forEach((lb, i) => {
      const txt = el("text", { x: x(i), y: H - 8, "text-anchor": "middle", "font-size": 11, fill: "var(--text-muted)" });
      txt.textContent = lb;
      svg.appendChild(txt);
    });

    // series: 2px線 + 終端マーカー(サーフェスリング付き)
    for (const s of series) {
      const d = s.values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
      svg.appendChild(el("path", { d, fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
      const li = s.values.length - 1;
      svg.appendChild(el("circle", { cx: x(li), cy: y(s.values[li]), r: 6, fill: "var(--surface-1)" }));
      svg.appendChild(el("circle", { cx: x(li), cy: y(s.values[li]), r: 4, fill: s.color }));
    }
    // 直接ラベル: 最終値のみ(選択的ラベリング)
    series.forEach((s, si) => {
      const li = s.values.length - 1;
      const txt = el("text", {
        x: x(li) - 8, y: y(s.values[li]) + (si === 0 ? -8 : si === 1 ? 14 : 22),
        "text-anchor": "end", "font-size": 10.5, "font-weight": 600, fill: "var(--text-secondary)",
      });
      txt.textContent = format(s.values[li]);
      svg.appendChild(txt);
    });

    // crosshair + hover layer
    const cross = el("line", { y1: pad.top, y2: pad.top + ih, stroke: "var(--baseline)", "stroke-width": 1, visibility: "hidden" });
    svg.appendChild(cross);
    const hoverDots = series.map((s) => {
      const g = el("g", { visibility: "hidden" });
      g.appendChild(el("circle", { r: 6, fill: "var(--surface-1)" }));
      g.appendChild(el("circle", { r: 4, fill: s.color }));
      svg.appendChild(g);
      return g;
    });
    const hit = el("rect", { x: pad.left, y: pad.top, width: iw, height: ih, fill: "transparent" });
    svg.appendChild(hit);

    function onMove(ev) {
      const box = svg.getBoundingClientRect();
      const px = ((ev.clientX - box.left) / box.width) * W;
      let idx = Math.round(((px - pad.left) / iw) * (labels.length - 1));
      idx = Math.max(0, Math.min(labels.length - 1, idx));
      cross.setAttribute("x1", x(idx));
      cross.setAttribute("x2", x(idx));
      cross.setAttribute("visibility", "visible");
      hoverDots.forEach((g, si) => {
        g.setAttribute("transform", `translate(${x(idx)},${y(series[si].values[idx])})`);
        g.setAttribute("visibility", "visible");
      });
      showTooltip(ev.clientX, ev.clientY, labels[idx],
        series.map((s) => ({ color: s.color, value: format(s.values[idx]), name: s.name })));
    }
    function onLeave() {
      cross.setAttribute("visibility", "hidden");
      hoverDots.forEach((g) => g.setAttribute("visibility", "hidden"));
      hideTooltip();
    }
    hit.addEventListener("pointermove", onMove);
    hit.addEventListener("pointerleave", onLeave);

    container.innerHTML = "";
    // legend(2系列以上は必ず表示)
    if (series.length >= 2) {
      const lg = document.createElement("div");
      lg.className = "chart-legend";
      for (const s of series) {
        const item = document.createElement("span");
        item.className = "lg";
        const key = document.createElement("span");
        key.className = "lg-line";
        key.style.background = s.color;
        item.append(key, document.createTextNode(s.name));
        lg.appendChild(item);
      }
      container.appendChild(lg);
    }
    container.appendChild(svg);
  }

  /* 横棒チャート(パイプライン等)
     opts: { items:[{label, value, color, sub}], format(v) } */
  function barH(container, opts) {
    const { items, format = (v) => String(v) } = opts;
    const W = 640;
    const rowH = 34, barH = 20; // 棒は24px以下
    const pad = { top: 6, right: 90, bottom: 6, left: 78 };
    const H = pad.top + items.length * rowH + pad.bottom;
    const iw = W - pad.left - pad.right;
    const maxV = Math.max(...items.map((d) => d.value));

    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" });
    items.forEach((d, i) => {
      const cy = pad.top + i * rowH + rowH / 2;
      const w = Math.max((d.value / maxV) * iw, 2);
      // ラベル(テキストトークン)
      const lb = el("text", { x: pad.left - 10, y: cy + 4, "text-anchor": "end", "font-size": 12, fill: "var(--text-secondary)" });
      lb.textContent = d.label;
      svg.appendChild(lb);
      // 棒: ベースライン側は直角、データ端のみ4px丸め
      const r = Math.min(4, w / 2);
      const x0 = pad.left, yT = cy - barH / 2, yB = cy + barH / 2;
      const path = el("path", {
        d: `M${x0},${yT} H${x0 + w - r} Q${x0 + w},${yT} ${x0 + w},${yT + r} V${yB - r} Q${x0 + w},${yB} ${x0 + w - r},${yB} H${x0} Z`,
        fill: d.color,
      });
      svg.appendChild(path);
      // 値ラベル: 棒の先端外側
      const val = el("text", { x: pad.left + w + 8, y: cy + 4, "font-size": 11.5, "font-weight": 600, fill: "var(--text-secondary)", style: "font-variant-numeric: tabular-nums" });
      val.textContent = format(d.value);
      svg.appendChild(val);
      // ヒットターゲット(マークより大きく)
      const hit = el("rect", { x: 0, y: pad.top + i * rowH, width: W, height: rowH, fill: "transparent" });
      hit.addEventListener("pointermove", (ev) => {
        showTooltip(ev.clientX, ev.clientY, d.label, [{ color: d.color, value: format(d.value), name: d.sub || "" }]);
        path.setAttribute("opacity", "0.85");
      });
      hit.addEventListener("pointerleave", () => { hideTooltip(); path.setAttribute("opacity", "1"); });
      svg.appendChild(hit);
    });
    // baseline
    svg.appendChild(el("line", { x1: pad.left, x2: pad.left, y1: pad.top, y2: H - pad.bottom, stroke: "var(--baseline)", "stroke-width": 1 }));

    container.innerHTML = "";
    container.appendChild(svg);
  }

  return { line, barH };
})();
