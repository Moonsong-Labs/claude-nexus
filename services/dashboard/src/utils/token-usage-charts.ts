/**
 * Token usage specific chart utilities
 */

import { formatNumber } from './chart-helpers.js'

export interface MiniChartData {
  remaining: number
  percentageUsed?: number
}

export interface TimeSeriesData {
  time: string
  remaining: number
  percentageUsed: number
}

/**
 * Token usage threshold colors
 */
export const TOKEN_USAGE_COLORS = {
  safe: '#10b981', // Green
  warning: '#f59e0b', // Yellow
  danger: '#ef4444', // Red
  critical: '#dc2626', // Dark red
} as const

/**
 * Get color based on usage percentage
 */
export function getUsageColor(percentageUsed: number): string {
  if (percentageUsed > 90) {
    return TOKEN_USAGE_COLORS.danger
  }
  if (percentageUsed > 70) {
    return TOKEN_USAGE_COLORS.warning
  }
  return TOKEN_USAGE_COLORS.safe
}

/**
 * Chart dimensions for token usage charts
 */
export const TOKEN_CHART_DIMENSIONS = {
  miniChart: {
    width: 200,
    height: 60,
  },
  timeSeriesChart: {
    width: '100%',
    height: 400,
    padding: { top: 20, right: 20, bottom: 60, left: 80 },
  },
} as const

/**
 * Generate script for mini sparkline charts
 */
export function generateMiniChartScript(
  chartId: string,
  data: MiniChartData[],
  tokenLimit: number,
  percentageUsed: number
): string {
  return `
    <script>
    (function() {
      try {
        const canvas = document.getElementById('${chartId}');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        
        const data = ${JSON.stringify(data)};
        const tokenLimit = ${tokenLimit};
        
        // Draw background
        ctx.fillStyle = '#f9fafb';
        ctx.fillRect(0, 0, rect.width, rect.height);
        
        // Draw the line
        ctx.beginPath();
        ctx.lineWidth = 1.5;
        
        data.forEach((point, index) => {
          const x = (index / (data.length - 1)) * rect.width;
          const y = rect.height - (point.remaining / tokenLimit) * rect.height;
          
          if (index === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        
        // Set stroke color based on usage
        ctx.strokeStyle = '${getUsageColor(percentageUsed)}';
        ctx.stroke();
        
        // Fill area
        ctx.lineTo(rect.width, rect.height);
        ctx.lineTo(0, rect.height);
        ctx.closePath();
        ctx.fillStyle = ctx.strokeStyle + '20'; // Add transparency
        ctx.fill();
      } catch (error) {
        console.error('Error rendering mini chart:', error);
      }
    })();
    </script>
  `
}

/**
 * Generate script for cumulative usage time series chart
 */
export function generateTimeSeriesChartScript(
  chartId: string,
  timeSeries: TimeSeriesData[],
  tokenLimit: number
): string {
  return `
    <script>
    (function() {
      // Prepare chart data
      const chartData = ${JSON.stringify(
        timeSeries.map(point => ({
          time: new Date(point.time).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          remaining: point.remaining,
          percentageUsed: point.percentageUsed,
        }))
      )};
      
      const tokenLimit = ${tokenLimit};
      
      // Wait for canvas to be ready
      setTimeout(() => {
        try {
          const canvas = document.getElementById('${chartId}');
          if (!canvas) return;
          
          const ctx = canvas.getContext('2d');
          const rect = canvas.getBoundingClientRect();
          canvas.width = rect.width * window.devicePixelRatio;
          canvas.height = rect.height * window.devicePixelRatio;
          ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
          
          const padding = ${JSON.stringify(TOKEN_CHART_DIMENSIONS.timeSeriesChart.padding)};
          const chartWidth = rect.width - padding.left - padding.right;
          const chartHeight = rect.height - padding.top - padding.bottom;
          
          // Clear canvas
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, rect.width, rect.height);
          
          // Draw axes
          ctx.strokeStyle = '#e5e7eb';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(padding.left, padding.top);
          ctx.lineTo(padding.left, padding.top + chartHeight);
          ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
          ctx.stroke();
          
          // Draw horizontal grid lines and Y-axis labels
          ctx.fillStyle = '#6b7280';
          ctx.font = '12px sans-serif';
          ctx.textAlign = 'right';
          
          const ySteps = 5;
          for (let i = 0; i <= ySteps; i++) {
            const y = padding.top + (chartHeight * i / ySteps);
            const value = tokenLimit * (1 - i / ySteps);
            
            // Grid line
            ctx.strokeStyle = '#f3f4f6';
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(padding.left + chartWidth, y);
            ctx.stroke();
            
            // Label
            ctx.fillStyle = '#6b7280';
            ctx.fillText(formatNumber(value), padding.left - 10, y + 4);
          }
          
          // Draw X-axis labels (show every nth label to avoid crowding)
          ctx.textAlign = 'center';
          const labelInterval = Math.ceil(chartData.length / 12);
          chartData.forEach((point, index) => {
            if (index % labelInterval === 0 || index === chartData.length - 1) {
              const x = padding.left + (index / (chartData.length - 1)) * chartWidth;
              ctx.fillText(point.time, x, padding.top + chartHeight + 20);
            }
          });
          
          // Draw the cumulative usage line
          ctx.beginPath();
          ctx.lineWidth = 2;
          
          chartData.forEach((point, index) => {
            const x = padding.left + (index / (chartData.length - 1)) * chartWidth;
            const y = padding.top + (1 - point.remaining / tokenLimit) * chartHeight;
            
            if (index === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          });
          
          // Create gradient for the line based on usage
          const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
          gradient.addColorStop(0, '${TOKEN_USAGE_COLORS.safe}'); // Green at top (low usage)
          gradient.addColorStop(0.5, '${TOKEN_USAGE_COLORS.warning}'); // Yellow in middle
          gradient.addColorStop(0.8, '${TOKEN_USAGE_COLORS.danger}'); // Red near bottom (high usage)
          gradient.addColorStop(1, '${TOKEN_USAGE_COLORS.critical}'); // Dark red at bottom
          
          ctx.strokeStyle = gradient;
          ctx.stroke();
          
          // Fill area under the curve with semi-transparent gradient
          ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
          ctx.lineTo(padding.left, padding.top + chartHeight);
          ctx.closePath();
          
          const fillGradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
          fillGradient.addColorStop(0, 'rgba(16, 185, 129, 0.1)');
          fillGradient.addColorStop(0.5, 'rgba(245, 158, 11, 0.1)');
          fillGradient.addColorStop(0.8, 'rgba(239, 68, 68, 0.2)');
          fillGradient.addColorStop(1, 'rgba(220, 38, 38, 0.3)');
          
          ctx.fillStyle = fillGradient;
          ctx.fill();
          
          // Draw current point
          const lastPoint = chartData[chartData.length - 1];
          const lastX = padding.left + chartWidth;
          const lastY = padding.top + (1 - lastPoint.remaining / tokenLimit) * chartHeight;
          
          // Determine color based on percentage used
          ctx.fillStyle = '${getUsageColor(0)}'; // This will be replaced dynamically
          ctx.fillStyle = lastPoint.percentageUsed > 90 ? '${TOKEN_USAGE_COLORS.danger}' : 
                         lastPoint.percentageUsed > 70 ? '${TOKEN_USAGE_COLORS.warning}' : 
                         '${TOKEN_USAGE_COLORS.safe}';
          
          ctx.beginPath();
          ctx.arc(lastX, lastY, 5, 0, Math.PI * 2);
          ctx.fill();
          
          // Draw current value label
          ctx.fillStyle = '#1f2937';
          ctx.font = '14px sans-serif';
          ctx.textAlign = 'right';
          ctx.fillText(
            formatNumber(lastPoint.remaining) + ' tokens remaining',
            lastX - 10,
            lastY - 10
          );
          
          // Add axis labels
          ctx.fillStyle = '#374151';
          ctx.font = '14px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('Time', padding.left + chartWidth / 2, rect.height - 10);
          
          ctx.save();
          ctx.translate(15, padding.top + chartHeight / 2);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText('Tokens Remaining', 0, 0);
          ctx.restore();
          
          // Helper function
          function formatNumber(num) {
            return num.toLocaleString();
          }
        } catch (error) {
          console.error('Error rendering time series chart:', error);
        }
      }, 100);
    })();
    </script>
  `
}

/**
 * Generate HTML for progress bar
 */
export function generateProgressBar(current: number, limit: number, label: string): string {
  const percentage = limit > 0 ? Math.min(100, (current / limit) * 100) : 0
  const color = getUsageColor(percentage)

  return `
    <div style="position: relative; background: #f3f4f6; height: 40px; border-radius: 0.5rem; overflow: hidden;">
      <div
        style="position: absolute; left: 0; top: 0; height: 100%; background: ${color}; width: ${percentage}%; transition: width 0.3s ease;"
      ></div>
      <div
        style="position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-weight: 600; color: #1f2937;"
      >
        ${formatNumber(current)} / ${formatNumber(limit)} ${label}
        (${Math.round(percentage)}%)
      </div>
    </div>
  `
}
