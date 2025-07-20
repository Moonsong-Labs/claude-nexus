/**
 * Chart rendering script generation utilities
 *
 * These functions generate client-side JavaScript for chart rendering.
 * Future improvement: Consider migrating to a charting library like Chart.js
 */

import { CHART_CONFIG, TIME_CONFIG } from './chart-constants.js'

interface ChartDataPoint {
  hour: string
  count: number
}

interface ChartScriptOptions {
  chartId: string
  chartData: ChartDataPoint[] | Record<string, ChartDataPoint[]>
  displayDomain: string | null
  domainColors: Record<string, string>
  chartType: 'requests' | 'tokens'
}

/**
 * Generate the client-side JavaScript for rendering hourly usage charts
 */
export function generateChartScript(options: ChartScriptOptions): string {
  const { chartId, chartData, displayDomain, domainColors, chartType } = options
  const padding = chartType === 'tokens' ? CHART_CONFIG.tokenChartPadding : CHART_CONFIG.padding
  const tooltipColor =
    chartType === 'tokens' ? CHART_CONFIG.tooltipTokenColor : CHART_CONFIG.tooltipSuccessColor
  const chartTitle = chartType === 'tokens' ? 'Output Tokens per Hour' : 'Requests per Hour'
  const unitName = chartType === 'tokens' ? 'tokens' : 'requests'
  const unitLabel = chartType === 'tokens' ? 'Output Tokens' : 'Requests'

  // Create script content using string concatenation to avoid nested template literals
  const scriptContent = `
    // Chart data from API
    const chartData_${chartId} = ${JSON.stringify(chartData)};
    const displayDomain_${chartId} = ${JSON.stringify(displayDomain)};
    const domainColors_${chartId} = ${JSON.stringify(domainColors)};
    
    // Helper to format numbers with commas
    function formatNumber(num) {
      return num.toLocaleString();
    }
    
    // Initialize chart rendering
    function renderChart_${chartId}() {
      try {
        const canvas = document.getElementById('${chartId}');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        
        const padding = ${JSON.stringify(padding)};
        const chartWidth = rect.width - padding.left - padding.right;
        const chartHeight = rect.height - padding.top - padding.bottom;
        
        // Clear canvas
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, rect.width, rect.height);
        
        // Create complete hourly timeline for 7 days
        const now = new Date();
        const startTime = new Date(now.getTime() - ${TIME_CONFIG.millisecondsInWeek});
        startTime.setMinutes(0, 0, 0);
        
        const hourlyTimeline = [];
        const isSingleDomain = displayDomain_${chartId} !== null;
        
        if (isSingleDomain) {
          // Single domain view
          const dataMap = new Map();
          chartData_${chartId}.forEach(point => {
            const hourKey = new Date(point.hour).toISOString();
            dataMap.set(hourKey, point.count);
          });
          
          for (let i = 0; i < ${TIME_CONFIG.hoursInWeek}; i++) {
            const time = new Date(startTime.getTime() + i * ${TIME_CONFIG.millisecondsInHour});
            const hourKey = time.toISOString();
            hourlyTimeline.push({
              time: time,
              count: dataMap.get(hourKey) || 0
            });
          }
        } else {
          // Multi-domain stacked view
          const domainDataMaps = {};
          const allDomains = Object.keys(chartData_${chartId});
          
          // Build data maps for each domain
          allDomains.forEach(domain => {
            domainDataMaps[domain] = new Map();
            if (chartData_${chartId}[domain]) {
              chartData_${chartId}[domain].forEach(point => {
                const hourKey = new Date(point.hour).toISOString();
                domainDataMaps[domain].set(hourKey, point.count);
              });
            }
          });
          
          // Create timeline with stacked data
          for (let i = 0; i < ${TIME_CONFIG.hoursInWeek}; i++) {
            const time = new Date(startTime.getTime() + i * ${TIME_CONFIG.millisecondsInHour});
            const hourKey = time.toISOString();
            const dataPoint = { time: time, domains: {} };
            
            allDomains.forEach(domain => {
              dataPoint.domains[domain] = domainDataMaps[domain].get(hourKey) || 0;
            });
            
            hourlyTimeline.push(dataPoint);
          }
        }
        
        // Find max count for scaling
        let maxCount;
        if (isSingleDomain) {
          maxCount = Math.max(...hourlyTimeline.map(d => d.count), 1);
        } else {
          // For stacked view, max is the sum of all domains at any hour
          maxCount = Math.max(...hourlyTimeline.map(d => 
            Object.values(d.domains).reduce((sum, count) => sum + count, 0)
          ), 1);
        }
        const yScale = chartHeight / maxCount;
        const barWidth = chartWidth / hourlyTimeline.length;
        
        // Draw axes
        ctx.strokeStyle = '${CHART_CONFIG.axisColor}';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding.left, padding.top);
        ctx.lineTo(padding.left, padding.top + chartHeight);
        ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
        ctx.stroke();
        
        // Draw Y-axis labels and grid lines
        ctx.fillStyle = '${CHART_CONFIG.textColor}';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'right';
        
        const ySteps = 5;
        for (let i = 0; i <= ySteps; i++) {
          const y = padding.top + (chartHeight * i / ySteps);
          const value = Math.round(maxCount * (1 - i / ySteps));
          
          // Grid line
          ctx.strokeStyle = '${CHART_CONFIG.gridLineColor}';
          ctx.beginPath();
          ctx.moveTo(padding.left, y);
          ctx.lineTo(padding.left + chartWidth, y);
          ctx.stroke();
          
          // Label
          ctx.fillStyle = '${CHART_CONFIG.textColor}';
          ctx.fillText(formatNumber(value), padding.left - 10, y + 4);
        }
        
        // Draw bars
        if (isSingleDomain) {
          // Single domain - simple bars
          hourlyTimeline.forEach((point, index) => {
            if (point.count > 0) {
              const x = padding.left + index * barWidth;
              const barHeight = point.count * yScale;
              const y = padding.top + chartHeight - barHeight;
              
              ctx.fillStyle = displayDomain_${chartId} ? domainColors_${chartId}[displayDomain_${chartId}] : '${CHART_CONFIG.defaultColor}';
              ctx.fillRect(x, y, barWidth - 1, barHeight);
            }
          });
        } else {
          // Multi-domain - stacked bars
          const allDomains = Object.keys(chartData_${chartId});
          
          hourlyTimeline.forEach((point, index) => {
            const x = padding.left + index * barWidth;
            let stackHeight = 0;
            
            allDomains.forEach(domain => {
              const count = point.domains[domain] || 0;
              if (count > 0) {
                const segmentHeight = count * yScale;
                const y = padding.top + chartHeight - stackHeight - segmentHeight;
                
                ctx.fillStyle = domainColors_${chartId}[domain];
                ctx.fillRect(x, y, barWidth - 1, segmentHeight);
                
                stackHeight += segmentHeight;
              }
            });
          });
        }
        
        // Draw X-axis labels (show date labels for each day)
        ctx.fillStyle = '${CHART_CONFIG.textColor}';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        
        const uniqueDays = new Set();
        hourlyTimeline.forEach((point, index) => {
          const dateStr = point.time.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          if (!uniqueDays.has(dateStr) && point.time.getHours() === 12) { // Show label at noon
            uniqueDays.add(dateStr);
            const x = padding.left + index * barWidth + barWidth / 2;
            ctx.fillText(dateStr, x, padding.top + chartHeight + 25);
          }
        });
        
        // Add title
        ctx.fillStyle = '${CHART_CONFIG.titleColor}';
        ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('${chartTitle}', padding.left, padding.top - 10);
        
        // Add hover interaction with custom tooltip
        let tooltipDiv = null;
        
        canvas.addEventListener('mousemove', (e) => {
          const rect = canvas.getBoundingClientRect();
          const x = e.clientX - rect.left - padding.left;
          const index = Math.floor(x / barWidth);
          
          if (index >= 0 && index < hourlyTimeline.length) {
            const point = hourlyTimeline[index];
            const startTime = point.time;
            const endTime = new Date(startTime.getTime() + ${TIME_CONFIG.millisecondsInHour}); // Add 1 hour
            
            // Create or update tooltip
            if (!tooltipDiv) {
              tooltipDiv = document.createElement('div');
              tooltipDiv.style.position = 'absolute';
              tooltipDiv.style.backgroundColor = '${CHART_CONFIG.tooltipBackground}';
              tooltipDiv.style.color = '${CHART_CONFIG.tooltipTextColor}';
              tooltipDiv.style.padding = '8px 12px';
              tooltipDiv.style.borderRadius = '6px';
              tooltipDiv.style.fontSize = '12px';
              tooltipDiv.style.pointerEvents = 'none';
              tooltipDiv.style.zIndex = '1000';
              tooltipDiv.style.fontFamily = 'sans-serif';
              tooltipDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
              document.body.appendChild(tooltipDiv);
            }
            
            let tooltipHTML = '<div style="font-weight: 600; margin-bottom: 4px;">';
            tooltipHTML += startTime.toLocaleString('en-US', { 
              month: 'short', 
              day: 'numeric', 
              hour: 'numeric',
              minute: '2-digit'
            });
            tooltipHTML += ' - ';
            tooltipHTML += endTime.toLocaleString('en-US', { 
              hour: 'numeric',
              minute: '2-digit'
            });
            tooltipHTML += '</div>';
            
            if (isSingleDomain) {
              tooltipHTML += '<div style="color: ${tooltipColor};">${unitLabel}: ' + formatNumber(point.count) + '</div>';
            } else {
              const total = Object.values(point.domains).reduce((sum, count) => sum + count, 0);
              tooltipHTML += '<div style="color: ${tooltipColor}; margin-bottom: 4px;">Total: ' + formatNumber(total) + ' ${unitName}</div>';
              
              if (total > 0) {
                tooltipHTML += '<div style="border-top: 1px solid rgba(255,255,255,0.2); margin-top: 4px; padding-top: 4px;">';
                Object.entries(point.domains).forEach(([domain, count]) => {
                  if (count > 0) {
                    const color = domainColors_${chartId}[domain];
                    tooltipHTML += '<div style="display: flex; align-items: center; margin: 2px 0;">';
                    tooltipHTML += '<div style="width: 10px; height: 10px; background: ' + color + '; margin-right: 6px; border-radius: 2px;"></div>';
                    tooltipHTML += '<div style="flex: 1;">' + domain + '</div>';
                    tooltipHTML += '<div style="margin-left: 8px;">' + formatNumber(count) + '</div>';
                    tooltipHTML += '</div>';
                  }
                });
                tooltipHTML += '</div>';
              }
            }
            
            tooltipDiv.innerHTML = tooltipHTML;
            tooltipDiv.style.display = 'block';
            
            // Position tooltip
            const tooltipX = e.pageX + 10;
            const tooltipY = e.pageY - 10;
            tooltipDiv.style.left = tooltipX + 'px';
            tooltipDiv.style.top = tooltipY + 'px';
            
            // Adjust if tooltip goes off screen
            const tooltipRect = tooltipDiv.getBoundingClientRect();
            if (tooltipRect.right > window.innerWidth) {
              tooltipDiv.style.left = (e.pageX - tooltipRect.width - 10) + 'px';
            }
            if (tooltipRect.bottom > window.innerHeight) {
              tooltipDiv.style.top = (e.pageY - tooltipRect.height - 10) + 'px';
            }
          }
        });
        
        canvas.addEventListener('mouseleave', () => {
          if (tooltipDiv) {
            tooltipDiv.style.display = 'none';
          }
        });
      } catch (error) {
        console.error('Error rendering chart:', error);
      }
    }
    
    // Wait for canvas to be ready
    setTimeout(renderChart_${chartId}, 100);
  `

  // Replace the placeholders with actual values
  return (
    '<script>' +
    scriptContent
      .replace(/\${tooltipColor}/g, tooltipColor)
      .replace(/\${unitLabel}/g, unitLabel)
      .replace(/\${unitName}/g, unitName) +
    '</script>'
  )
}
