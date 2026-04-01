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
    datasetIndicator: document.getElementById('datasetIndicator'),
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
  };

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
  const formatDate = dateStr =>
    new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

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
        ctx.fillStyle = 'rgba(245, 158, 11, 0.08)';
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
            ctx.shadowColor = 'rgba(245, 158, 11, 0.4)';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(point.x, point.y, 6, 0, 2 * Math.PI);
            ctx.fillStyle = '#f59e0b';
            ctx.strokeStyle = '#ffffff';
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
    dom.datasetIndicator.style.display = 'none';
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
  };

  const initChart = () => {
    const ctx = document.getElementById('mortgageChart').getContext('2d');
    state.activePointIndex = state.chartData.single_costs.length - 1;

    const labels = state.chartData.single_costs.map(d => d.date);
    const singleData = state.chartData.single_costs.map(d => d.cost_to_income);
    const householdData = state.chartData.household_costs.map(
      d => d.cost_to_income,
    );

    const style = getComputedStyle(document.body);
    const colorPrimary =
      style.getPropertyValue('--accent-blue').trim() || '#3b82f6';
    const colorSecondary =
      style.getPropertyValue('--accent-purple').trim() || '#8b5cf6';
    const gridColor =
      style.getPropertyValue('--border-color').trim() || '#e5e7eb';
    const textColor =
      style.getPropertyValue('--text-secondary').trim() || '#6b7280';

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
                  ? `${colorPrimary}80`
                  : colorPrimary;
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
                  ? `${colorSecondary}80`
                  : colorSecondary;
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
                if (d.estimated) title += ' 🔮 (Estimated)';
                else if (d.interpolated) title += ' 📊 (Interpolated)';
                return title;
              },
              afterTitle: ctx => {
                const d = state.chartData.single_costs[ctx[0].dataIndex];
                return `\nHouse Price: ${formatMoney(d.home_price)}\nMortgage Rate: ${d.mortgage_rate}%\nTotal Cost: ${formatMoney(d.total_cost)}`;
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
  };

  // Event & UI Handlers
  const clearDateButtons = () =>
    document
      .querySelectorAll('.date-range-buttons .btn')
      .forEach(b => b.classList.remove('active'));

  const setDateRange = range => {
    state.currentRange = range;

    const end = new Date(state.maxDate);
    let start = new Date(state.maxDate);

    if (range === '1y') start.setFullYear(end.getFullYear() - 1);
    else if (range === '2y') start.setFullYear(end.getFullYear() - 2);
    else if (range === '5y') start.setFullYear(end.getFullYear() - 5);
    else if (range === 'all') start = new Date(state.minDate);

    const startIndex = state.chartData.single_costs.findIndex(
      d => new Date(d.date) >= start,
    );
    const endIndex = state.chartData.single_costs.findIndex(
      d => new Date(d.date) >= end,
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

    syncUrlParams();
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

    document.querySelectorAll('.controls .btn').forEach(btn => {
      btn.classList.toggle('btn-primary', btn.id === btnId);
      btn.classList.toggle('active', btn.id === btnId);
      btn.classList.toggle('btn-secondary', btn.id !== btnId);
    });
    updateInfoCards(state.activePointIndex);
    syncUrlParams();
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
    dom.btnToggleY.textContent = state.yAxisZero
      ? 'Y-Axis: Zero'
      : 'Y-Axis: Auto';
    state.chartInstance.update();
    syncUrlParams();
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
      const response = await fetch(url);
      if (!response.ok) {
        if (stateCode !== 'ALL') {
          throw new Error(
            `Data for ${STATE_NAMES[stateCode]} is not yet available. Run the data script first.`,
          );
        }
        throw new Error('Failed to load data file. Run the Ruby script first.');
      }

      state.currentState = stateCode;
      state.chartData = await response.json();
      state.firstEstimatedIndex = state.chartData.single_costs.findIndex(
        i => i.estimated || i.interpolated,
      );

      state.minDate = new Date(state.chartData.single_costs[0].date);
      state.maxDate = new Date(
        state.chartData.single_costs[state.chartData.single_costs.length - 1]
          .date,
      );

      // Metadata setup
      const genDate = new Date(
        state.chartData.metadata.generated_at,
      ).toLocaleString();
      const actCount =
        state.firstEstimatedIndex === -1
          ? state.chartData.single_costs.length
          : state.firstEstimatedIndex;
      const estCount = state.chartData.single_costs.length - actCount;
      dom.updateInfo.textContent = `Last updated: ${genDate} | ${actCount} actual ${estCount > 0 ? '+ ' + estCount + ' estimated' : ''} data points`;

      document.getElementById('loadingMessage').style.display = 'none';
      mainContent.style.display = 'block';

      updateHeaderForState(stateCode);
      initChart();
      syncUrlParams();
    } catch (error) {
      console.error(error);
      if (state.chartInstance) {
        dom.updateInfo.textContent = `Error: ${error.message}`;
      } else {
        document.getElementById('loadingMessage').innerHTML =
          `<div class="error-message"><strong>Error:</strong> ${error.message}</div>`;
      }
    } finally {
      mainContent.classList.remove('is-loading');
    }
  };

  // Listeners bindings
  document.addEventListener('DOMContentLoaded', () => {
    // Read URL params and apply initial state
    const params = readUrlParams();
    state.currentRange = params.range;
    state.currentView = params.view;
    state.yAxisZero = params.yaxis === 'zero';
    dom.stateSelect.value = params.state;

    if (state.yAxisZero) {
      dom.btnToggleY.textContent = 'Y-Axis: Zero';
    }

    document
      .getElementById('btnBoth')
      .addEventListener('click', () =>
        updateLineVisibility(true, true, 'btnBoth'),
      );
    document
      .getElementById('btnSingle')
      .addEventListener('click', () =>
        updateLineVisibility(true, false, 'btnSingle'),
      );
    document
      .getElementById('btnHousehold')
      .addEventListener('click', () =>
        updateLineVisibility(false, true, 'btnHousehold'),
      );

    document.querySelectorAll('.date-range-buttons .btn').forEach(btn => {
      btn.addEventListener('click', function () {
        setDateRange(this.dataset.range);
      });
    });

    document.getElementById('btnResetZoom').addEventListener('click', () => {
      state.chartInstance.resetZoom();
      setDateRange('all');
    });
    document
      .getElementById('btnDownload')
      .addEventListener('click', downloadChart);
    dom.btnToggleY.addEventListener('click', toggleYAxis);

    // State market selector
    const resizeSelect = () => {
      const tmp = document.createElement('span');
      const cs = getComputedStyle(dom.stateSelect);
      tmp.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:' + cs.font + ';letter-spacing:' + cs.letterSpacing;
      tmp.textContent = dom.stateSelect.options[dom.stateSelect.selectedIndex].text;
      document.body.appendChild(tmp);
      dom.stateSelect.style.width = (tmp.offsetWidth + 52) + 'px';
      tmp.remove();
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
    });

    loadData(params.state);
  });
})();
