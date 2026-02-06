// Global variables
var chartData = null;
var chartInstance = null;
var firstEstimatedIndex = -1;
var activePointIndex = -1;
var minDate = null;
var maxDate = null;

// Plugin: Estimated Region Background
var estimatedRegionPlugin = {
    id: 'estimatedRegion',
    beforeDraw: function (chart) {
        if (firstEstimatedIndex === -1) return;

        var ctx = chart.ctx;
        var chartArea = chart.chartArea;
        var meta = chart.getDatasetMeta(0);

        if (!meta.data[firstEstimatedIndex]) return;

        var x = meta.data[firstEstimatedIndex].x;

        ctx.save();
        ctx.fillStyle = 'rgba(243, 156, 18, 0.08)';
        ctx.fillRect(x, chartArea.top, chartArea.right - x, chartArea.bottom - chartArea.top);
        ctx.restore();
    }
};

// Plugin: Active "Golden Dot" Indicator
var activePointPlugin = {
    id: 'activePoint',
    afterDatasetsDraw: function (chart) {
        if (activePointIndex === -1) return;

        var ctx = chart.ctx;
        var chartArea = chart.chartArea;

        chart.data.datasets.forEach(function (dataset, i) {
            if (chart.isDatasetVisible(i)) {
                var meta = chart.getDatasetMeta(i);
                var point = meta.data[activePointIndex];

                if (point &&
                    point.x >= chartArea.left &&
                    point.x <= chartArea.right &&
                    point.y >= chartArea.top &&
                    point.y <= chartArea.bottom) {

                    ctx.save();

                    ctx.shadowColor = 'rgba(243, 156, 18, 0.4)';
                    ctx.shadowBlur = 10;

                    ctx.beginPath();
                    ctx.arc(point.x, point.y, 6, 0, 2 * Math.PI);
                    ctx.fillStyle = '#f39c12';
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 3;

                    ctx.fill();
                    ctx.stroke();

                    ctx.restore();
                }
            }
        });
    }
};

function updateZoomTip() {
    var tip = document.getElementById('zoomTip');
    var hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (hasTouch) {
        tip.innerHTML = '\uD83D\uDCA1 <strong>Tip:</strong> Pinch to zoom. Drag to pan (when zoomed). Tap any point to view details. Use arrow keys to step through data points.';
    } else {
        tip.innerHTML = '\uD83D\uDCA1 <strong>Tip:</strong> Scroll to zoom. Click and drag to pan (when zoomed). Click any point to view details. Use arrow keys to step through data points.';
    }
}

function updateMetadata() {
    if (chartData.metadata) {
        var generatedAt = new Date(chartData.metadata.generated_at);
        var dateStr = generatedAt.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        var actualCount = firstEstimatedIndex === -1 ? chartData.single_costs.length : firstEstimatedIndex;
        var estimatedCount = firstEstimatedIndex === -1 ? 0 : chartData.single_costs.length - firstEstimatedIndex;

        var updateText = 'Last updated: ' + dateStr + ' | ' + actualCount + ' actual';
        if (estimatedCount > 0) {
            updateText += ' + ' + estimatedCount + ' estimated data points';
        } else {
            updateText += ' data points';
        }

        document.getElementById('updateInfo').textContent = updateText;
    }
}

function initializeChart() {
    var ctx = document.getElementById('mortgageChart').getContext('2d');

    activePointIndex = chartData.single_costs.length - 1;

    var labels = chartData.single_costs.map(function (item) { return item.date; });
    var singleMultipliers = chartData.single_costs.map(function (item) { return item.cost_to_income; });
    var householdMultipliers = chartData.household_costs.map(function (item) { return item.cost_to_income; });

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Single Income',
                data: singleMultipliers,
                borderColor: 'rgb(102, 126, 234)',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 8,
                pointHoverBackgroundColor: 'rgb(102, 126, 234)',
                pointHoverBorderColor: 'white',
                pointHoverBorderWidth: 3,
                segment: {
                    borderDash: function (ctx) {
                        var index = ctx.p1DataIndex;
                        var dataPoint = chartData.single_costs[index];
                        return (dataPoint.estimated || dataPoint.interpolated) ? [8, 4] : [];
                    },
                    borderColor: function (ctx) {
                        var index = ctx.p1DataIndex;
                        var dataPoint = chartData.single_costs[index];
                        return (dataPoint.estimated || dataPoint.interpolated) ?
                            'rgba(102, 126, 234, 0.7)' : 'rgb(102, 126, 234)';
                    }
                }
            },
            {
                label: 'Household Income (1.4x)',
                data: householdMultipliers,
                borderColor: 'rgb(118, 75, 162)',
                backgroundColor: 'rgba(118, 75, 162, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 8,
                pointHoverBackgroundColor: 'rgb(118, 75, 162)',
                pointHoverBorderColor: 'white',
                pointHoverBorderWidth: 3,
                segment: {
                    borderDash: function (ctx) {
                        var index = ctx.p1DataIndex;
                        var dataPoint = chartData.household_costs[index];
                        return (dataPoint.estimated || dataPoint.interpolated) ? [8, 4] : [];
                    },
                    borderColor: function (ctx) {
                        var index = ctx.p1DataIndex;
                        var dataPoint = chartData.household_costs[index];
                        return (dataPoint.estimated || dataPoint.interpolated) ?
                            'rgba(118, 75, 162, 0.7)' : 'rgb(118, 75, 162)';
                    }
                }
            }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            onClick: function (event, elements, chart) {
                var index = -1;

                if (elements.length > 0) {
                    index = elements[0].index;
                } else {
                    var points = chart.getElementsAtEventForMode(event, 'index', {
                        intersect: false
                    }, false);
                    if (points.length > 0) {
                        index = points[0].index;
                    }
                }

                if (index !== -1) {
                    activePointIndex = index;
                    updateInfoCards(index);
                    chart.update();
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        font: {
                            size: 14,
                            weight: 'bold'
                        },
                        padding: 20,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    enabled: true,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 15,
                    titleFont: {
                        size: 14,
                        weight: 'bold'
                    },
                    bodyFont: {
                        size: 13
                    },
                    callbacks: {
                        title: function (context) {
                            var index = context[0].dataIndex;
                            var singleData = chartData.single_costs[index];
                            var title = 'Date: ' + context[0].label;

                            if (singleData.estimated) {
                                title += ' \uD83D\uDD2E (Estimated)';
                            } else if (singleData.interpolated) {
                                title += ' \uD83D\uDCCA (Interpolated)';
                            }

                            return title;
                        },
                        afterTitle: function (context) {
                            var index = context[0].dataIndex;
                            var singleData = chartData.single_costs[index];
                            return '\n' +
                                'House Price: $' + singleData.home_price.toLocaleString() + '\n' +
                                'Mortgage Rate: ' + singleData.mortgage_rate + '%\n' +
                                'Total Cost: $' + singleData.total_cost.toLocaleString();
                        },
                        label: function (context) {
                            var index = context.dataIndex;
                            var isSingle = context.datasetIndex === 0;
                            var data = isSingle ? chartData.single_costs[index] : chartData.household_costs[index];
                            var incomeKey = isSingle ? 'single_income' : 'household_income';

                            return [
                                context.dataset.label + ':',
                                '  Multiplier: ' + data.cost_to_income + 'x',
                                '  Income: $' + data[incomeKey].toLocaleString()
                            ];
                        }
                    }
                },
                zoom: {
                    zoom: {
                        wheel: {
                            enabled: true,
                            speed: 0.1
                        },
                        pinch: {
                            enabled: true
                        },
                        mode: 'x',
                        onZoomComplete: function () {
                            clearDateRangeHighlight();
                        }
                    },
                    pan: {
                        enabled: true,
                        mode: 'x',
                        modifierKey: null,
                        threshold: 10,
                        onPanComplete: function () {
                            clearDateRangeHighlight();
                        }
                    },
                    limits: {
                        x: {
                            min: 'original',
                            max: 'original'
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: true,
                    type: 'category',
                    title: {
                        display: true,
                        text: 'Date',
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    },
                    ticks: {
                        minRotation: 0,
                        maxRotation: 45,
                        maxTicksLimit: 12,
                        autoSkip: true
                    },
                    grid: {
                        display: false
                    }
                },
                y: {
                    display: true,
                    title: {
                        display: true,
                        text: 'Cost-to-Income Multiplier',
                        font: {
                            size: 14,
                            weight: 'bold'
                        }
                    },
                    beginAtZero: false,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                }
            }
        },
        plugins: [estimatedRegionPlugin, activePointPlugin]
    });

    updateInfoCards(activePointIndex);

    setDateRange('2y');
    highlightActiveButton('2y');
}

function clearDateRangeHighlight() {
    document.querySelectorAll('.date-range-buttons .btn').forEach(function (btn) {
        btn.classList.remove('active');
    });
}

function resetZoom() {
    chartInstance.resetZoom();
    highlightActiveButton('all');
}

function highlightActiveButton(range) {
    document.querySelectorAll('.date-range-buttons .btn').forEach(function (btn) {
        btn.classList.remove('active');
    });

    var buttons = document.querySelectorAll('.date-range-buttons .btn');
    var rangeIndex = { '1y': 0, '2y': 1, '5y': 2, 'all': 3 };
    if (rangeIndex[range] !== undefined) {
        buttons[rangeIndex[range]].classList.add('active');
    }
}

function setDateRange(range) {
    var endDate = new Date(maxDate);
    var startDate = new Date(maxDate);

    switch (range) {
        case '1y':
            startDate.setFullYear(endDate.getFullYear() - 1);
            break;
        case '2y':
            startDate.setFullYear(endDate.getFullYear() - 2);
            break;
        case '5y':
            startDate.setFullYear(endDate.getFullYear() - 5);
            break;
        case 'all':
            startDate = new Date(minDate);
            break;
    }

    var startIndex = chartData.single_costs.findIndex(function (item) {
        return new Date(item.date) >= startDate;
    });
    var endIndex = chartData.single_costs.findIndex(function (item) {
        return new Date(item.date) >= endDate;
    });

    if (startIndex !== -1) {
        chartInstance.zoomScale('x', {
            min: startIndex,
            max: endIndex !== -1 ? endIndex : chartData.single_costs.length - 1
        });
    }

    highlightActiveButton(range);
}

function updateInfoCards(index) {
    var singleData = chartData.single_costs[index];
    var householdData = chartData.household_costs[index];

    var singleVisible = chartInstance.isDatasetVisible(0);
    var householdVisible = chartInstance.isDatasetVisible(1);

    var displayData, displayIncome, datasetLabel;
    if (singleVisible && householdVisible) {
        displayData = singleData;
        displayIncome = singleData.single_income;
        datasetLabel = 'Showing Single Income values (both lines visible)';
    } else if (singleVisible) {
        displayData = singleData;
        displayIncome = singleData.single_income;
        datasetLabel = '';
    } else if (householdVisible) {
        displayData = householdData;
        displayIncome = householdData.household_income;
        datasetLabel = '';
    } else {
        displayData = singleData;
        displayIncome = singleData.single_income;
        datasetLabel = '';
    }

    // Update selected date
    var date = new Date(singleData.date);
    document.getElementById('selectedDate').textContent = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });

    // Update dataset indicator
    var indicator = document.getElementById('datasetIndicator');
    indicator.textContent = datasetLabel;
    indicator.style.display = datasetLabel ? 'block' : 'none';

    document.getElementById('currentMultiplier').textContent = displayData.cost_to_income + 'x';
    document.getElementById('housePrice').textContent = '$' + displayData.home_price.toLocaleString();
    document.getElementById('annualIncome').textContent = '$' + displayIncome.toLocaleString();
    document.getElementById('mortgageRate').textContent = displayData.mortgage_rate + '%';

    var details = displayData.estimation_details || {};
    var isMultiplierEstimated = displayData.estimated || displayData.interpolated;
    var isPriceEstimated = details.price_estimated || false;
    var isIncomeEstimated = details.income_estimated || false;

    updateCard('multiplierCard', isMultiplierEstimated, displayData.estimated ? 'Estimated' : 'Interpolated');
    updateCard('priceCard', isPriceEstimated, displayData.estimated ? 'Estimated' : 'Interpolated');
    updateCard('incomeCard', isIncomeEstimated, displayData.estimated ? 'Estimated' : 'Interpolated');
}

function updateCard(cardId, isEstimated, badgeText) {
    var card = document.getElementById(cardId);

    // Always remove existing badge first to prevent stale text
    var existingBadge = card.querySelector('.estimated-badge');
    if (existingBadge) existingBadge.remove();

    if (isEstimated) {
        card.classList.add('estimated');
        var badge = document.createElement('span');
        badge.className = 'estimated-badge';
        badge.textContent = badgeText;
        card.appendChild(badge);
    } else {
        card.classList.remove('estimated');
    }
}

function showBothLines() {
    chartInstance.show(0);
    chartInstance.show(1);
    updateButtonStates(0);
    updateInfoCards(activePointIndex);
}

function showSingleOnly() {
    chartInstance.show(0);
    chartInstance.hide(1);
    updateButtonStates(1);
    updateInfoCards(activePointIndex);
}

function showHouseholdOnly() {
    chartInstance.hide(0);
    chartInstance.show(1);
    updateButtonStates(2);
    updateInfoCards(activePointIndex);
}

function updateButtonStates(activeIndex) {
    var buttons = document.querySelectorAll('.controls .btn');
    buttons.forEach(function (btn, index) {
        if (index === activeIndex) {
            btn.classList.remove('btn-secondary');
            btn.classList.add('btn-primary', 'active');
        } else {
            btn.classList.remove('btn-primary', 'active');
            btn.classList.add('btn-secondary');
        }
    });
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', function () {
    updateZoomTip();

    // Attach button event listeners
    document.getElementById('btnBoth').addEventListener('click', showBothLines);
    document.getElementById('btnSingle').addEventListener('click', showSingleOnly);
    document.getElementById('btnHousehold').addEventListener('click', showHouseholdOnly);
    document.getElementById('btnResetZoom').addEventListener('click', resetZoom);

    document.querySelectorAll('.date-range-buttons .btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            setDateRange(this.dataset.range);
        });
    });

    // Keyboard navigation on chart container
    document.querySelector('.chart-container').addEventListener('keydown', function (e) {
        if (!chartInstance || !chartData) return;

        if (e.key === 'ArrowRight') {
            e.preventDefault();
            if (activePointIndex < chartData.single_costs.length - 1) {
                activePointIndex++;
                updateInfoCards(activePointIndex);
                chartInstance.update();
            }
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (activePointIndex > 0) {
                activePointIndex--;
                updateInfoCards(activePointIndex);
                chartInstance.update();
            }
        }
    });

    // Fetch data
    fetch('weekly_case_shiller_output.json')
        .then(function (response) {
            if (!response.ok) {
                throw new Error('Failed to load data file. Please run the Ruby script first.');
            }
            return response.json();
        })
        .then(function (data) {
            chartData = data;

            firstEstimatedIndex = chartData.single_costs.findIndex(function (item) {
                return item.estimated === true || item.interpolated === true;
            });

            if (firstEstimatedIndex !== -1) {
                document.getElementById('estimationWarning').style.display = 'block';
            }

            minDate = new Date(chartData.single_costs[0].date);
            maxDate = new Date(chartData.single_costs[chartData.single_costs.length - 1].date);

            initializeChart();
            updateMetadata();
            document.getElementById('loadingMessage').style.display = 'none';
            document.getElementById('mainContent').style.display = 'block';
        })
        .catch(function (error) {
            console.error('Error loading data:', error);
            document.getElementById('loadingMessage').innerHTML =
                '<div class="error-message">' +
                '<strong>Error Loading Data</strong><br>' +
                error.message + '<br><br>' +
                'Please ensure you have run the Ruby script to generate weekly_case_shiller_output.json' +
                '</div>';
        });
});
