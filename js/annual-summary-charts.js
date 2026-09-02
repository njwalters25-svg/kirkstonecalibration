// ============================================================
// annual-summary-charts.js — Live business dashboard charts
// Uses the same invoice data as Annual Summary. No extra library.
// ============================================================

(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const MONEY = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

  function jobs() {
    if (typeof getInvoiceSpreadsheetJobs === 'function') return getInvoiceSpreadsheetJobs();
    if (typeof currentJobs !== 'undefined' && Array.isArray(currentJobs)) return currentJobs.filter(j => j.invoiceSpreadsheetAdded === true);
    return [];
  }

  function values(job) {
    if (typeof getInvoiceSpreadsheetValues === 'function') return getInvoiceSpreadsheetValues(job);
    return job.invoiceSpreadsheetSnapshot || {};
  }

  function months() {
    const now = new Date();
    const start = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(start, 3 + i, 1);
      return { year: d.getFullYear(), month: d.getMonth(), label: d.toLocaleDateString('en-GB', { month: 'short' }), income: 0, costs: 0, profit: 0, cumulative: 0 };
    });
  }

  function paidDate(job) {
    if (!job.invoiceDatePaid) return null;
    const d = new Date(job.invoiceDatePaid + 'T00:00:00');
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function data() {
    const monthly = months();
    const fixed = 483 + 150 + 3 + 103.17 + 100 + (3000 / 12);
    const customers = new Map();

    jobs().forEach(job => {
      const v = values(job);
      const d = paidDate(job);
      if (!d) return;
      const m = monthly.find(x => x.year === d.getFullYear() && x.month === d.getMonth());
      if (!m) return;
      m.income += Number(v.excVat) || 0;
      m.costs += Number(v.cost) || 0;
      const name = String(v.company || job.customerName || 'Unknown').trim() || 'Unknown';
      customers.set(name, (customers.get(name) || 0) + (Number(v.excVat) || 0));
    });

    let running = 0;
    monthly.forEach(m => {
      m.profit = m.income - m.costs - fixed;
      running += m.profit;
      m.cumulative = running;
    });

    const customerRows = Array.from(customers, ([name, revenue]) => ({ name, revenue })).sort((a, b) => b.revenue - a.revenue);
    return { monthly, customerRows };
  }

  function svgEl(name, attrs) {
    const el = document.createElementNS(NS, name);
    Object.entries(attrs || {}).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  }

  function text(svg, x, y, value, attrs) {
    const t = svgEl('text', Object.assign({ x, y }, attrs || {}));
    t.textContent = value;
    svg.appendChild(t);
  }

  function lineChart(container, rows) {
    const w = 760, h = 270, left = 62, right = 18, top = 18, bottom = 38;
    const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': 'Cumulative profit by month' });
    const vals = rows.map(r => r.cumulative);
    const min = Math.min(0, ...vals), max = Math.max(0, ...vals);
    const span = Math.max(1, max - min);
    const x = i => left + i * ((w - left - right) / (rows.length - 1));
    const y = v => top + (max - v) * ((h - top - bottom) / span);

    for (let i = 0; i <= 4; i++) {
      const val = min + span * (i / 4);
      const yy = y(val);
      svg.appendChild(svgEl('line', { x1: left, y1: yy, x2: w - right, y2: yy, class: 'chart-grid' }));
      text(svg, left - 8, yy + 4, MONEY.format(val), { class: 'chart-axis', 'text-anchor': 'end' });
    }
    const zeroY = y(0);
    svg.appendChild(svgEl('line', { x1: left, y1: zeroY, x2: w - right, y2: zeroY, class: 'chart-zero' }));
    const points = rows.map((r, i) => `${x(i)},${y(r.cumulative)}`).join(' ');
    svg.appendChild(svgEl('polyline', { points, class: 'chart-profit-line' }));
    rows.forEach((r, i) => {
      const c = svgEl('circle', { cx: x(i), cy: y(r.cumulative), r: 4, class: 'chart-profit-dot' });
      const title = svgEl('title'); title.textContent = `${r.label}: ${MONEY.format(r.cumulative)}`; c.appendChild(title); svg.appendChild(c);
      text(svg, x(i), h - 14, r.label, { class: 'chart-axis', 'text-anchor': 'middle' });
    });
    container.appendChild(svg);
  }

  function monthlyBars(container, rows) {
    const w = 760, h = 300, left = 62, right = 18, top = 18, bottom = 42;
    const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': 'Monthly income costs and profit' });
    const all = rows.flatMap(r => [r.income, r.costs, r.profit]);
    const min = Math.min(0, ...all), max = Math.max(0, ...all), span = Math.max(1, max - min);
    const plotW = w - left - right, groupW = plotW / rows.length, barW = Math.max(5, groupW * 0.2);
    const y = v => top + (max - v) * ((h - top - bottom) / span);
    for (let i = 0; i <= 4; i++) {
      const val = min + span * (i / 4), yy = y(val);
      svg.appendChild(svgEl('line', { x1: left, y1: yy, x2: w - right, y2: yy, class: 'chart-grid' }));
      text(svg, left - 8, yy + 4, MONEY.format(val), { class: 'chart-axis', 'text-anchor': 'end' });
    }
    const zero = y(0);
    rows.forEach((r, i) => {
      const cx = left + i * groupW + groupW / 2;
      [['income','chart-income',-barW], ['costs','chart-costs',0], ['profit','chart-profit',barW]].forEach(([key, cls, offset]) => {
        const val = r[key], yy = y(val), rectY = Math.min(yy, zero), height = Math.max(1, Math.abs(zero - yy));
        const rect = svgEl('rect', { x: cx + Number(offset) - barW / 2, y: rectY, width: barW, height, rx: 2, class: cls });
        const title = svgEl('title'); title.textContent = `${r.label} ${key}: ${MONEY.format(val)}`; rect.appendChild(title); svg.appendChild(rect);
      });
      text(svg, cx, h - 15, r.label, { class: 'chart-axis', 'text-anchor': 'middle' });
    });
    container.appendChild(svg);
  }

  function customerBars(container, rows) {
    if (!rows.length) { container.innerHTML = '<p class="chart-empty">No paid invoice data yet.</p>'; return; }
    const top = rows.slice(0, 10), w = 760, rowH = 31, left = 160, right = 75, topPad = 12, h = topPad + top.length * rowH + 10;
    const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': 'Revenue by customer' });
    const max = Math.max(...top.map(r => r.revenue), 1), available = w - left - right;
    top.forEach((r, i) => {
      const y = topPad + i * rowH;
      const width = available * r.revenue / max;
      text(svg, left - 8, y + 18, r.name.length > 22 ? r.name.slice(0, 21) + '…' : r.name, { class: 'chart-customer-label', 'text-anchor': 'end' });
      const rect = svgEl('rect', { x: left, y: y + 5, width, height: 18, rx: 3, class: 'chart-customer' });
      const title = svgEl('title'); title.textContent = `${r.name}: ${MONEY.format(r.revenue)}`; rect.appendChild(title); svg.appendChild(rect);
      text(svg, left + width + 7, y + 18, MONEY.format(r.revenue), { class: 'chart-value' });
    });
    container.appendChild(svg);
  }

  function render() {
    const summary = document.getElementById('annualSummary');
    if (!summary) return;
    let dashboard = document.getElementById('annualChartsDashboard');
    if (!dashboard) {
      dashboard = document.createElement('div');
      dashboard.id = 'annualChartsDashboard';
      dashboard.className = 'annual-charts-dashboard';
      summary.appendChild(dashboard);
    }
    const d = data();
    dashboard.innerHTML = `
      <h2>Business Dashboard</h2>
      <p class="annual-charts-intro">Live charts from paid invoices in the Invoice Spreadsheet.</p>
      <div class="annual-chart-grid">
        <div class="annual-chart-card annual-chart-wide"><h3>Monthly Income, Costs & Profit</h3><div class="chart-legend"><span class="legend-income">Income</span><span class="legend-costs">Job costs</span><span class="legend-profit">Profit after fixed costs</span></div><div id="monthlyBusinessChart" class="annual-chart"></div></div>
        <div class="annual-chart-card"><h3>Cumulative Profit</h3><div id="cumulativeProfitChart" class="annual-chart"></div></div>
        <div class="annual-chart-card"><h3>Revenue by Customer</h3><p class="chart-subtitle">Top 10 customers, paid invoices only</p><div id="customerRevenueChart" class="annual-chart"></div></div>
      </div>`;
    monthlyBars(document.getElementById('monthlyBusinessChart'), d.monthly);
    lineChart(document.getElementById('cumulativeProfitChart'), d.monthly);
    customerBars(document.getElementById('customerRevenueChart'), d.customerRows);
  }

  function styles() {
    if (document.getElementById('annualChartStyles')) return;
    const s = document.createElement('style'); s.id = 'annualChartStyles';
    s.textContent = `
      .annual-charts-dashboard{margin-top:22px;border-top:2px solid #e2e8f0;padding-top:18px}.annual-charts-dashboard>h2{margin:0;color:var(--primary)}.annual-charts-intro,.chart-subtitle{margin:.3rem 0 12px;color:var(--text-light);font-size:12px}.annual-chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.annual-chart-card{border:1px solid var(--border);border-radius:9px;padding:14px;background:#fff;min-width:0}.annual-chart-wide{grid-column:1/-1}.annual-chart-card h3{margin:0 0 8px;color:var(--primary)}.annual-chart{width:100%;overflow-x:auto}.annual-chart svg{display:block;width:100%;min-width:620px;height:auto}.chart-grid{stroke:#e5e7eb;stroke-width:1}.chart-zero{stroke:#94a3b8;stroke-width:1.2}.chart-axis{font-size:10px;fill:#64748b}.chart-customer-label{font-size:11px;fill:#334155}.chart-value{font-size:10px;fill:#475569}.chart-income{fill:#2563eb}.chart-costs{fill:#f59e0b}.chart-profit{fill:#16a34a}.chart-profit-line{fill:none;stroke:#16a34a;stroke-width:3;stroke-linejoin:round;stroke-linecap:round}.chart-profit-dot{fill:#fff;stroke:#16a34a;stroke-width:3}.chart-customer{fill:#2563eb}.chart-legend{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:4px;font-size:11px;color:#475569}.chart-legend span:before{content:'';display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px}.legend-income:before{background:#2563eb}.legend-costs:before{background:#f59e0b}.legend-profit:before{background:#16a34a}.chart-empty{color:var(--text-light);font-size:12px}@media(max-width:900px){.annual-chart-grid{grid-template-columns:1fr}.annual-chart-wide{grid-column:auto}}
    `;
    document.head.appendChild(s);
  }

  window.renderAnnualSummaryCharts = render;

  document.addEventListener('DOMContentLoaded', () => {
    styles();
    const original = window.renderAnnualSummary;
    if (typeof original === 'function') {
      window.renderAnnualSummary = function () {
        const result = original.apply(this, arguments);
        render();
        return result;
      };
    }
    render();
  });
})();
