(() => {
  // Defaults for URL params (non-default values are written to the URL)
  const DEFAULTS = { state: 'ALL', range: '2y', view: 'both', yaxis: 'auto' };
  const VALID_RANGES = ['1y', '2y', '5y', 'all'];
  const VALID_VIEWS = ['both', 'single', 'household'];
  const VIEW_TO_BTN = { both: 'btnBoth', single: 'btnSingle', household: 'btnHousehold' };
  const BTN_TO_VIEW = { btnBoth: 'both', btnSingle: 'single', btnHousehold: 'household' };

  // Encapsulated Application State
  const state = {
    chartData: null,
    chartInstance: null,
    chartColors: {},
    firstEstimatedIndex: -1,
    activePointIndex: -1,
    minDate: null,
    maxDate: null,
    yAxisZero: false,
    currentState: 'ALL',
    currentRange: '2y',
    currentView: 'both',
  };

  // State name lookup for display
  const STATE_NAMES = {
    ALL: 'U.S.', AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas',
    CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
    DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii',
    ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
    KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
    MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
    MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
    NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
    NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
    OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
    SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
    VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
    WI: 'Wisconsin', WY: 'Wyoming',
  };

  // DOM Elements
  const dom = {
    updateInfo: document.getElementById('updateInfo'),
    selectedDate: document.getElementById('selectedDate'),
    currentMultiplier: document.getElementById('currentMultiplier'),
    housePrice: document.getElementById('housePrice'),
    annualIncome: document.getElementById('annualIncome'),
    mortgageRate: document.getElementById('mortgageRate'),
    multiplierCard: document.getElementById('multiplierCard'),
    priceCard: document.getElementById('priceCard'),
    incomeCard: document.getElementById('incomeCard'),
    btnToggleY: document.getElementById('btnToggleY'),
    stateSelect: document.getElementById('stateSelect'),
    headerEyebrow: document.getElementById('headerEyebrow'),
    dateRangeButtons: document.querySelectorAll('.date-range-buttons .btn'),
    controlsButtons: document.querySelectorAll('.controls-views .btn'),
    chartLiveRegion: document.getElementById('chartLiveRegion'),
  };

  let fetchToken = 0;
  let currentFetchController = null;
  let lastPointerPos = null;
  document.addEventListener('pointermove', e => {
    lastPointerPos = { clientX: e.clientX, clientY: e.clientY };
  });

  // URL Parameter Management
  const resolveState = raw => {
    if (!raw) return DEFAULTS.state;
    const upper = raw.toUpperCase();
    if (upper === 'US' || upper === 'ALL') return 'ALL';
    return STATE_NAMES[upper] ? upper : DEFAULTS.state;
  };

  const readUrlParams = () => {
    const params = new URLSearchParams(window.location.search);
    const range = (params.get('range') || '').toLowerCase();
    const view = (params.get('view') || '').toLowerCase();
    const yaxis = (params.get('yaxis') || '').toLowerCase();
    return {
      state: resolveState(params.get('state')),
      range: VALID_RANGES.includes(range) ? range : DEFAULTS.range,
      view: VALID_VIEWS.includes(view) ? view : DEFAULTS.view,
      yaxis: yaxis === 'zero' ? 'zero' : DEFAULTS.yaxis,
    };
  };

  const syncUrlParams = () => {
    const params = new URLSearchParams();
    params.set('state', state.currentState.toLowerCase());
    params.set('range', state.currentRange);
    params.set('view', state.currentView);
    params.set('yaxis', state.yAxisZero ? 'zero' : 'auto');

    const url = `${window.location.pathname}?${params.toString()}`;
    history.replaceState(null, '', url);
  };

  // Formatting Utilities
  const formatMoney = val => '$' + Math.round(val).toLocaleString();
  const formatDate = dateStr => {
    const [y, m, d] = dateStr.split('-');
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };
  const toIsoLocal = date => {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };

  // Chart Plugins
  const plugins = {
    estimatedRegion: {
      id: 'estimatedRegion',
      beforeDraw: chart => {
        if (state.firstEstimatedIndex === -1) return;
        const { ctx, chartArea } = chart;
        const meta = chart.getDatasetMeta(0);
        if (!meta.data[state.firstEstimatedIndex]) return;

        const x = meta.data[state.firstEstimatedIndex].x;
        ctx.save();
        ctx.fillStyle = `${state.chartColors.amber}14`;
        ctx.fillRect(
          x,
          chartArea.top,
          chartArea.right - x,
          chartArea.bottom - chartArea.top,
        );
        ctx.restore();
      },
    },
    activePoint: {
      id: 'activePoint',
      afterDatasetsDraw: chart => {
        if (state.activePointIndex === -1) return;
        const { ctx, chartArea } = chart;

        chart.data.datasets.forEach((dataset, i) => {
          if (!chart.isDatasetVisible(i)) return;
          const point = chart.getDatasetMeta(i).data[state.activePointIndex];

          if (
            point &&
            point.x >= chartArea.left &&
            point.x <= chartArea.right &&
            point.y >= chartArea.top &&
            point.y <= chartArea.bottom
          ) {
            ctx.save();
            ctx.shadowColor = `${state.chartColors.amber}66`;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(point.x, point.y, 6, 0, 2 * Math.PI);
            ctx.fillStyle = state.chartColors.amber;
            ctx.strokeStyle = state.chartColors.bgContainer;
            ctx.lineWidth = 3;
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }
        });
      },
    },
    customCanvasBackgroundColor: {
      id: 'customCanvasBackgroundColor',
      beforeDraw: chart => {
        const { ctx } = chart;
        ctx.save();
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle =
          getComputedStyle(document.documentElement)
            .getPropertyValue('--bg-container')
            .trim() || '#ffffff';
        ctx.fillRect(0, 0, chart.width, chart.height);
        ctx.restore();
      },
    },
  };

  // Core Updates
  const updateCardBadge = (card, isEstimated, text) => {
    const existing = card.querySelector('.estimated-badge');
    if (existing) existing.remove();

    if (isEstimated) {
      card.classList.add('estimated');
      const badge = document.createElement('span');
      badge.className = 'estimated-badge';
      badge.textContent = text;
      card.appendChild(badge);
    } else {
      card.classList.remove('estimated');
    }
  };

  const updateInfoCards = index => {
    const singleData = state.chartData.single_costs[index];
    const householdData = state.chartData.household_costs[index];
    const singleVisible = state.chartInstance.isDatasetVisible(0);
    const householdVisible = state.chartInstance.isDatasetVisible(1);
    const bothVisible = singleVisible && householdVisible;

    dom.selectedDate.textContent = formatDate(singleData.date);
    dom.housePrice.textContent = formatMoney(singleData.home_price);
    dom.mortgageRate.textContent = `${singleData.mortgage_rate}%`;

    if (bothVisible) {
      dom.currentMultiplier.innerHTML =
        `<span class="dual-value single">${singleData.cost_to_income}x</span>` +
        `<span class="dual-value household">${householdData.cost_to_income}x</span>`;
      dom.annualIncome.innerHTML =
        `<span class="dual-value single">${formatMoney(singleData.single_income)}</span>` +
        `<span class="dual-value household">${formatMoney(householdData.household_income)}</span>`;
    } else if (householdVisible) {
      dom.currentMultiplier.textContent = `${householdData.cost_to_income}x`;
      dom.annualIncome.textContent = formatMoney(householdData.household_income);
    } else {
      dom.currentMultiplier.textContent = `${singleData.cost_to_income}x`;
      dom.annualIncome.textContent = formatMoney(singleData.single_income);
    }

    const details = singleData.estimation_details || {};
    updateCardBadge(
      dom.multiplierCard,
      singleData.estimated || singleData.interpolated,
      singleData.estimated ? 'Estimated' : 'Interpolated',
    );
    updateCardBadge(
      dom.priceCard,
      details.price_estimated,
      singleData.estimated ? 'Estimated' : 'Interpolated',
    );
    updateCardBadge(
      dom.incomeCard,
      details.income_estimated,
      singleData.estimated ? 'Estimated' : 'Interpolated',
    );

    if (dom.chartLiveRegion) {
      const stateName = STATE_NAMES[state.currentState] || state.currentState;
      const multiplierPart = bothVisible
        ? `Price-to-Income ${singleData.cost_to_income}x (single) / ${householdData.cost_to_income}x (dual)`
        : householdVisible
          ? `Price-to-Income ${householdData.cost_to_income}x`
          : `Price-to-Income ${singleData.cost_to_income}x`;
      dom.chartLiveRegion.textContent = `${formatDate(singleData.date)} - ${stateName}: ${multiplierPart}, Median Home Price ${formatMoney(singleData.home_price)}, Mortgage ${singleData.mortgage_rate}%`;
    }
  };

  const readChartTokens = () => {
    const style = getComputedStyle(document.documentElement);
    return {
      primary: style.getPropertyValue('--accent-blue').trim() || '#3b82f6',
      secondary: style.getPropertyValue('--accent-purple').trim() || '#8b5cf6',
      gridColor: style.getPropertyValue('--border-color').trim() || '#e5e7eb',
      textColor: style.getPropertyValue('--text-secondary').trim() || '#6b7280',
      amber: style.getPropertyValue('--accent-amber').trim() || '#f59e0b',
      bgContainer: style.getPropertyValue('--bg-container').trim() || '#ffffff',
    };
  };

  const initChart = () => {
    const ctx = document.getElementById('mortgageChart').getContext('2d');
    state.activePointIndex = state.chartData.single_costs.length - 1;

    const labels = state.chartData.single_costs.map(d => d.date);
    const singleData = state.chartData.single_costs.map(d => d.cost_to_income);
    const householdData = state.chartData.household_costs.map(
      d => d.cost_to_income,
    );

    state.chartColors = readChartTokens();
    const { primary: colorPrimary, secondary: colorSecondary, gridColor, textColor } = state.chartColors;

    state.chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Single Earner',
            data: singleData,
            borderColor: colorPrimary,
            backgroundColor: `${colorPrimary}20`,
            borderWidth: 3,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 8,
            segment: {
              borderDash: ctx => {
                const d = state.chartData.single_costs[ctx.p1DataIndex];
                return d?.estimated || d?.interpolated ? [8, 4] : [];
              },
              borderColor: ctx => {
                const d = state.chartData.single_costs[ctx.p1DataIndex];
                return d?.estimated || d?.interpolated
                  ? `${state.chartColors.primary}80`
                  : state.chartColors.primary;
              },
            },
          },
          {
            label: 'Dual Income (1.4×)',
            data: householdData,
            borderColor: colorSecondary,
            backgroundColor: `${colorSecondary}20`,
            borderWidth: 3,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 8,
            segment: {
              borderDash: ctx => {
                const d = state.chartData.household_costs[ctx.p1DataIndex];
                return d?.estimated || d?.interpolated ? [8, 4] : [];
              },
              borderColor: ctx => {
                const d = state.chartData.household_costs[ctx.p1DataIndex];
                return d?.estimated || d?.interpolated
                  ? `${state.chartColors.secondary}80`
                  : state.chartColors.secondary;
              },
            },
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        onClick: (e, elements, chart) => {
          let index = -1;
          if (elements.length > 0) index = elements[0].index;
          else {
            const points = chart.getElementsAtEventForMode(
              e,
              'index',
              { intersect: false },
              false,
            );
            if (points.length > 0) index = points[0].index;
          }
          if (index !== -1) {
            state.activePointIndex = index;
            updateInfoCards(index);
            chart.update();
          }
        },
        plugins: {
          legend: {
            labels: {
              color: textColor,
              font: { size: 14, weight: 'bold' },
              usePointStyle: true,
            },
          },
          tooltip: {
            backgroundColor: 'rgba(17, 24, 39, 0.9)',
            padding: 15,
            callbacks: {
              title: ctx => {
                const d = state.chartData.single_costs[ctx[0].dataIndex];
                let title = `Date: ${ctx[0].label}`;
                if (d.estimated) title += ' (Estimated)';
                else if (d.interpolated) title += ' (Interpolated)';
                return title;
              },
              afterTitle: ctx => {
                const d = state.chartData.single_costs[ctx[0].dataIndex];
                return `\nHome Price: ${formatMoney(d.home_price)}\nMortgage Rate: ${d.mortgage_rate}%\nTotal Cost: ${formatMoney(d.total_cost)}`;
              },
              label: ctx => {
                const isSingle = ctx.datasetIndex === 0;
                const d = isSingle
                  ? state.chartData.single_costs[ctx.dataIndex]
                  : state.chartData.household_costs[ctx.dataIndex];
                const income = isSingle ? d.single_income : d.household_income;
                return `${ctx.dataset.label}: Multiplier ${d.cost_to_income}x (Income: ${formatMoney(income)})`;
              },
            },
          },
          zoom: {
            zoom: {
              wheel: { enabled: true, speed: 0.1 },
              pinch: { enabled: true },
              mode: 'x',
              onZoomComplete: clearDateButtons,
            },
            pan: {
              enabled: true,
              mode: 'x',
              threshold: 10,
              onPanComplete: clearDateButtons,
            },
            limits: { x: { min: 'original', max: 'original' } },
          },
        },
        scales: {
          x: {
            ticks: { color: textColor, maxTicksLimit: 12 },
            grid: { display: false },
          },
          y: {
            beginAtZero: state.yAxisZero,
            ticks: { color: textColor },
            grid: { color: gridColor },
            title: {
              display: true,
              text: 'Price-to-Income Ratio',
              color: textColor,
              font: { weight: 'bold' },
            },
          },
        },
      },
      plugins: [
        plugins.estimatedRegion,
        plugins.activePoint,
        plugins.customCanvasBackgroundColor,
      ],
    });

    updateInfoCards(state.activePointIndex);
    setDateRange(state.currentRange);
    applyCurrentView();

    // If the pointer is already over the new canvas (common after a state
    // switch), synthesize a mousemove so Chart.js starts tracking hover
    // without waiting for the user to jiggle the mouse or click.
    if (lastPointerPos) {
      const canvas = state.chartInstance.canvas;
      const rect = canvas.getBoundingClientRect();
      if (
        lastPointerPos.clientX >= rect.left &&
        lastPointerPos.clientX <= rect.right &&
        lastPointerPos.clientY >= rect.top &&
        lastPointerPos.clientY <= rect.bottom
      ) {
        canvas.dispatchEvent(
          new MouseEvent('mousemove', {
            clientX: lastPointerPos.clientX,
            clientY: lastPointerPos.clientY,
            bubbles: true,
          }),
        );
      }
    }
  };

  // Event & UI Handlers
  const clearDateButtons = () =>
    dom.dateRangeButtons.forEach(b => b.classList.remove('active'));

  const setDateRange = range => {
    state.currentRange = range;

    const [ey, em, ed] = state.maxDate.split('-').map(Number);
    const end = new Date(ey, em - 1, ed);
    let start;

    if (range === '1y') start = new Date(ey - 1, em - 1, ed);
    else if (range === '2y') start = new Date(ey - 2, em - 1, ed);
    else if (range === '5y') start = new Date(ey - 5, em - 1, ed);
    else {
      const [sy, sm, sd] = state.minDate.split('-').map(Number);
      start = new Date(sy, sm - 1, sd);
    }

    const startISO = toIsoLocal(start);
    const endISO = toIsoLocal(end);
    const startIndex = state.chartData.single_costs.findIndex(
      d => d.date >= startISO,
    );
    const endIndex = state.chartData.single_costs.findIndex(
      d => d.date >= endISO,
    );

    if (startIndex !== -1) {
      state.chartInstance.zoomScale('x', {
        min: startIndex,
        max:
          endIndex !== -1 ? endIndex : state.chartData.single_costs.length - 1,
      });
      clearDateButtons();
      const btn = document.querySelector(
        `.date-range-buttons .btn[data-range="${range}"]`,
      );
      if (btn) btn.classList.add('active');
    }
  };

  const applyCurrentView = () => {
    const btnId = VIEW_TO_BTN[state.currentView] || 'btnBoth';
    const showSingle = state.currentView !== 'household';
    const showHousehold = state.currentView !== 'single';
    updateLineVisibility(showSingle, showHousehold, btnId);
  };

  const updateLineVisibility = (showSingle, showHousehold, btnId) => {
    if (showSingle) state.chartInstance.show(0);
    else state.chartInstance.hide(0);
    if (showHousehold) state.chartInstance.show(1);
    else state.chartInstance.hide(1);

    state.currentView = BTN_TO_VIEW[btnId] || 'both';

    dom.controlsButtons.forEach(btn => {
      btn.classList.toggle('btn-primary', btn.id === btnId);
      btn.classList.toggle('active', btn.id === btnId);
      btn.classList.toggle('btn-secondary', btn.id !== btnId);
    });
    updateInfoCards(state.activePointIndex);
  };

  // Features
  const downloadChart = () => {
    const link = document.createElement('a');
    link.download = `home-affordability-${state.currentState}-${new Date().toISOString().split('T')[0]}.png`;
    link.href = state.chartInstance.toBase64Image();
    link.click();
  };

  const toggleYAxis = () => {
    state.yAxisZero = !state.yAxisZero;
    state.chartInstance.options.scales.y.beginAtZero = state.yAxisZero;
    dom.btnToggleY.textContent = state.yAxisZero ? 'Y-Axis: Zero' : 'Y-Axis: Auto';
    dom.btnToggleY.classList.toggle('active', state.yAxisZero);
    state.chartInstance.update();
  };

  const getDataUrl = stateCode => {
    if (stateCode === 'ALL') return 'weekly_case_shiller_output.json';
    return `data/${stateCode}.json`;
  };

  const updateHeaderForState = stateCode => {
    const name = STATE_NAMES[stateCode] || stateCode;
    dom.headerEyebrow.textContent =
      stateCode === 'ALL' ? 'U.S. Housing Market' : `${name} Housing Market`;
  };

  // Bootstrapping
  const loadData = async stateCode => {
    state.currentState = stateCode;

    const myToken = ++fetchToken;
    if (currentFetchController) currentFetchController.abort();
    currentFetchController = new AbortController();
    const controller = currentFetchController;

    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 15000);

    const mainContent = document.getElementById('mainContent');
    const isSwitch = state.chartInstance !== null;

    if (isSwitch) {
      mainContent.classList.add('is-loading');
    }

    try {
      if (state.chartInstance) {
        state.chartInstance.destroy();
        state.chartInstance = null;
      }

      const url = getDataUrl(stateCode);
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        if (stateCode !== 'ALL') {
          throw new Error(
            `Data for ${STATE_NAMES[stateCode]} is not yet available. Run the data script first.`,
          );
        }
        throw new Error('Failed to load data file. Run the Ruby script first.');
      }

      const json = await response.json();
      if (myToken !== fetchToken) return;

      state.chartData = json;
      state.firstEstimatedIndex = state.chartData.single_costs.findIndex(
        i => i.estimated || i.interpolated,
      );

      state.minDate = state.chartData.single_costs[0].date;
      state.maxDate =
        state.chartData.single_costs[state.chartData.single_costs.length - 1].date;

      // Metadata setup
      const genDate = new Date(
        state.chartData.metadata.generated_at,
      ).toLocaleString();
      const sq = state.chartData.metadata.series_quality;
      let countsText;
      if (sq) {
        const parts = [`${sq.observed} observed`];
        if (sq.interpolated > 0) parts.push(`${sq.interpolated} interpolated`);
        if (sq.extrapolated > 0) parts.push(`${sq.extrapolated} extrapolated`);
        countsText = `${parts.join(' + ')} data points`;
      } else {
        const actCount =
          state.firstEstimatedIndex === -1
            ? state.chartData.single_costs.length
            : state.firstEstimatedIndex;
        const estCount = state.chartData.single_costs.length - actCount;
        countsText = `${actCount} actual${estCount > 0 ? ' + ' + estCount + ' estimated' : ''} data points`;
      }
      dom.updateInfo.textContent = `Last updated: ${genDate} | ${countsText}`;

      document.getElementById('loadingMessage').style.display = 'none';
      mainContent.style.display = 'block';

      updateHeaderForState(stateCode);
      initChart();
      syncUrlParams();
    } catch (error) {
      if (error.name === 'AbortError') {
        if (timedOut) {
          const retryHTML = `Couldn't load data - network timeout. <button class="btn btn-secondary btn-small" id="retryBtn">Retry</button>`;
          if (isSwitch) {
            dom.updateInfo.innerHTML = retryHTML;
          } else {
            const lm = document.getElementById('loadingMessage');
            lm.innerHTML = `<div class="error-message">${retryHTML}</div>`;
            lm.style.display = '';
          }
          document.getElementById('retryBtn').addEventListener('click', () => loadData(stateCode));
        }
        return;
      }
      console.error(error);
      if (state.chartInstance) {
        dom.updateInfo.textContent = `Error: ${error.message}`;
      } else {
        document.getElementById('loadingMessage').innerHTML =
          `<div class="error-message"><strong>Error:</strong> ${error.message}</div>`;
      }
    } finally {
      clearTimeout(timeoutId);
      if (myToken === fetchToken) mainContent.classList.remove('is-loading');
    }
  };

  // Listeners bindings
  document.addEventListener('DOMContentLoaded', () => {
    // Read URL params and apply initial state
    const params = readUrlParams();
    const initialRange = params.range;
    state.currentRange = params.range;
    state.currentView = params.view;
    state.yAxisZero = params.yaxis === 'zero';
    dom.stateSelect.value = params.state;

    if (state.yAxisZero) {
      dom.btnToggleY.textContent = 'Y-Axis: Zero';
      dom.btnToggleY.classList.add('active');
    }

    document
      .getElementById('btnBoth')
      .addEventListener('click', () => {
        updateLineVisibility(true, true, 'btnBoth');
        syncUrlParams();
      });
    document
      .getElementById('btnSingle')
      .addEventListener('click', () => {
        updateLineVisibility(true, false, 'btnSingle');
        syncUrlParams();
      });
    document
      .getElementById('btnHousehold')
      .addEventListener('click', () => {
        updateLineVisibility(false, true, 'btnHousehold');
        syncUrlParams();
      });

    document.querySelector('.date-range-buttons').addEventListener('click', e => {
      const btn = e.target.closest('.btn');
      if (btn) { setDateRange(btn.dataset.range); syncUrlParams(); }
    });

    document.getElementById('btnResetZoom').addEventListener('click', () => {
      setDateRange(initialRange);
      syncUrlParams();
    });
    document
      .getElementById('btnDownload')
      .addEventListener('click', downloadChart);
    dom.btnToggleY.addEventListener('click', () => { toggleYAxis(); syncUrlParams(); });

    // State market selector
    const measureSpan = document.createElement('span');
    measureSpan.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap';
    document.body.appendChild(measureSpan);
    const resizeSelect = () => {
      const cs = getComputedStyle(dom.stateSelect);
      measureSpan.style.font = cs.font;
      measureSpan.style.letterSpacing = cs.letterSpacing;
      measureSpan.textContent = dom.stateSelect.options[dom.stateSelect.selectedIndex].text;
      dom.stateSelect.style.width = (measureSpan.offsetWidth + 52) + 'px';
    };
    resizeSelect();
    dom.stateSelect.addEventListener('change', () => {
      resizeSelect();
      loadData(dom.stateSelect.value);
    });

    // Keyboard arrows navigation
    document
      .querySelector('.chart-container')
      .addEventListener('keydown', e => {
        if (!state.chartInstance || !state.chartData) return;
        if (
          e.key === 'ArrowRight' &&
          state.activePointIndex < state.chartData.single_costs.length - 1
        ) {
          e.preventDefault();
          updateInfoCards(++state.activePointIndex);
          state.chartInstance.update();
        } else if (e.key === 'ArrowLeft' && state.activePointIndex > 0) {
          e.preventDefault();
          updateInfoCards(--state.activePointIndex);
          state.chartInstance.update();
        }
      });

    // Theme toggle
    document.getElementById('themeToggle').addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);

      if (state.chartInstance) {
        const tokens = readChartTokens();
        state.chartColors = tokens;
        const chart = state.chartInstance;

        chart.options.scales.x.ticks.color = tokens.textColor;
        chart.options.scales.y.ticks.color = tokens.textColor;
        chart.options.scales.y.grid.color = tokens.gridColor;
        chart.options.scales.y.title.color = tokens.textColor;
        chart.options.plugins.legend.labels.color = tokens.textColor;

        const ds = chart.data.datasets;
        ds[0].borderColor = tokens.primary;
        ds[0].backgroundColor = `${tokens.primary}20`;
        ds[1].borderColor = tokens.secondary;
        ds[1].backgroundColor = `${tokens.secondary}20`;

        chart.update('none');
      }
    });

    loadData(params.state);
  });
})();
