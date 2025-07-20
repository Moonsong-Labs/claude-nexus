/**
 * Chart rendering constants for dashboard visualizations
 */

/**
 * Predefined color palette for domain differentiation in charts
 */
export const DOMAIN_COLOR_PALETTE = [
  '#FF6B6B', // Soft red
  '#4ECDC4', // Turquoise
  '#45B7D1', // Sky blue
  '#96CEB4', // Sage green
  '#FECA57', // Golden yellow
  '#DDA0DD', // Plum
  '#98D8C8', // Mint
  '#F7DC6F', // Soft yellow
  '#BB8FCE', // Lavender
  '#85C1E2', // Light blue
  '#F8B500', // Amber
  '#6C5CE7', // Purple
  '#A8E6CF', // Pale green
  '#FFD3B6', // Peach
  '#FF8B94', // Coral
  '#C7CEEA', // Periwinkle
  '#B2DFDB', // Teal
  '#FFAAA5', // Salmon
  '#FF8C94', // Light coral
  '#B4A7D6', // Lilac
] as const

/**
 * Chart dimensions and padding configuration
 */
export const CHART_CONFIG = {
  padding: { top: 30, right: 30, bottom: 80, left: 80 },
  tokenChartPadding: { top: 30, right: 30, bottom: 80, left: 100 },
  defaultColor: '#3b82f6',
  gridLineColor: '#f3f4f6',
  axisColor: '#e5e7eb',
  textColor: '#6b7280',
  titleColor: '#1f2937',
  tooltipBackground: 'rgba(0, 0, 0, 0.9)',
  tooltipTextColor: 'white',
  tooltipSuccessColor: '#10b981',
  tooltipTokenColor: '#60a5fa',
} as const

/**
 * Time constants for chart rendering
 */
export const TIME_CONFIG = {
  hoursInWeek: 168,
  millisecondsInWeek: 7 * 24 * 60 * 60 * 1000,
  millisecondsInHour: 60 * 60 * 1000,
} as const
