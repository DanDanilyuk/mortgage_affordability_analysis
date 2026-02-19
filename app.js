(() => {
  // Encapsulated Application State
  const state = {
    chartData: null,
    chartInstance: null,
    firstEstimatedIndex: -1,
    activePointIndex: -1,
    minDate: null,
    maxDate: null,
    yAxisZero: false,
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
    // Ensures transparent background becomes solid when exporting as PNG
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

    let displayData = singleData;
    let displayIncome = singleData.single_income;
    let datasetLabel = '';

    if (singleVisible && householdVisible) {
      datasetLabel = 'Showing Single Income values (both lines visible)';
    } else if (householdVisible) {
      displayData = householdData;
      displayIncome = householdData.household_income;
    }

    dom.selectedDate.textContent = formatDate(displayData.date);
    dom.datasetIndicator.textContent = datasetLabel;
    dom.datasetIndicator.style.display = datasetLabel ? 'block' : 'none';

    dom.currentMultiplier.textContent = `${displayData.cost_to_income}x`;
    dom.housePrice.textContent = formatMoney(displayData.home_price);
    dom.annualIncome.textContent = formatMoney(displayIncome);
    dom.mortgageRate.textContent = `${displayData.mortgage_rate}%`;

    const details = displayData.estimation_details || {};
    updateCardBadge(
      dom.multiplierCard,
      displayData.estimated || displayData.interpolated,
      displayData.estimated ? 'Estimated' : 'Interpolated',
    );
    updateCardBadge(
      dom.priceCard,
      details.price_estimated,
      displayData.estimated ? 'Estimated' : 'Interpolated',
    );
    updateCardBadge(
      dom.incomeCard,
      details.income_estimated,
      displayData.estimated ? 'Estimated' : 'Interpolated',
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
            label: 'Single Income',
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
            label: 'Household Income (1.4x)',
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
              text: 'Cost-to-Income Multiplier',
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
    setDateRange('2y');
  };

  // Event & UI Handlers
  const clearDateButtons = () =>
    document
      .querySelectorAll('.date-range-buttons .btn')
      .forEach(b => b.classList.remove('active'));

  const setDateRange = range => {
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
  };

  const updateLineVisibility = (showSingle, showHousehold, btnId) => {
    if (showSingle) state.chartInstance.show(0);
    else state.chartInstance.hide(0);
    if (showHousehold) state.chartInstance.show(1);
    else state.chartInstance.hide(1);

    document.querySelectorAll('.controls .btn').forEach(btn => {
      btn.classList.toggle('btn-primary', btn.id === btnId);
      btn.classList.toggle('active', btn.id === btnId);
      btn.classList.toggle('btn-secondary', btn.id !== btnId);
    });
    updateInfoCards(state.activePointIndex);
  };

  // Features
  const downloadChart = () => {
    const link = document.createElement('a');
    link.download = `mortgage-affordability-${new Date().toISOString().split('T')[0]}.png`;
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
  };

  // Bootstrapping
  const loadData = async () => {
    try {
      const response = await fetch('weekly_case_shiller_output.json');
      if (!response.ok)
        throw new Error('Failed to load data file. Run the Ruby script first.');

      state.chartData = await response.json();
      state.firstEstimatedIndex = state.chartData.single_costs.findIndex(
        i => i.estimated || i.interpolated,
      );
      if (state.firstEstimatedIndex !== -1)
        document.getElementById('estimationWarning').style.display = 'block';

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
      document.getElementById('mainContent').style.display = 'block';

      initChart();
    } catch (error) {
      console.error(error);
      document.getElementById('loadingMessage').innerHTML =
        `<div class="error-message"><strong>Error:</strong> ${error.message}</div>`;
    }
  };

  // Listeners bindings
  document.addEventListener('DOMContentLoaded', () => {
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

    loadData();
  });
})();
