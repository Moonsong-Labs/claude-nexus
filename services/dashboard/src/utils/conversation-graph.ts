import { calculateSimpleLayout } from './simple-graph-layout.js'

export interface ConversationNode {
  id: string
  label: string
  timestamp: Date
  branchId: string
  parentId?: string
  tokens: number
  model: string
  hasError: boolean
}

export interface ConversationGraph {
  nodes: ConversationNode[]
  edges: Array<{ source: string; target: string }>
}

export interface LayoutNode {
  id: string
  x: number
  y: number
  width: number
  height: number
  branchId: string
  timestamp: Date
  label: string
  tokens: number
  model: string
  hasError: boolean
}

export interface LayoutEdge {
  id: string
  source: string
  target: string
  sections: Array<{
    startPoint: { x: number; y: number }
    endPoint: { x: number; y: number }
    bendPoints?: Array<{ x: number; y: number }>
  }>
}

export interface GraphLayout {
  nodes: LayoutNode[]
  edges: LayoutEdge[]
  width: number
  height: number
}

/**
 * Calculate the layout for a conversation graph
 */
export async function calculateGraphLayout(graph: ConversationGraph): Promise<GraphLayout> {
  // Use the simple layout algorithm
  return calculateSimpleLayout(graph)
}

/**
 * Generate branch colors consistently
 */
export function getBranchColor(branchId: string): string {
  if (branchId === 'main') {
    return '#6b7280' // gray-500
  }
  
  // Generate a color based on the branch ID hash
  const colors = [
    '#3b82f6', // blue-500
    '#10b981', // green-500
    '#8b5cf6', // purple-500
    '#f59e0b', // amber-500
    '#ef4444', // red-500
    '#06b6d4', // cyan-500
    '#f97316', // orange-500
    '#ec4899', // pink-500
  ]
  
  let hash = 0
  for (let i = 0; i < branchId.length; i++) {
    hash = ((hash << 5) - hash) + branchId.charCodeAt(i)
    hash = hash & hash // Convert to 32-bit integer
  }
  
  return colors[Math.abs(hash) % colors.length]
}

/**
 * Render the conversation graph as SVG
 */
export function renderGraphSVG(layout: GraphLayout, interactive: boolean = true): string {
  const padding = 40
  const nodeRadius = 6
  const width = layout.width + padding * 2
  const height = layout.height + padding * 2
  
  let svg = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">\n`
  
  // Add CSS styles
  svg += `<defs>
    <style>
      .graph-edge { stroke: #e5e7eb; stroke-width: 2; fill: none; }
      .graph-node { stroke-width: 2; }
      .graph-node-main { fill: #6b7280; stroke: #4b5563; }
      .graph-node-branch { stroke: #3b82f6; }
      .graph-node-error { fill: #ef4444; stroke: #dc2626; }
      .graph-node-label { font-size: 10px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; }
      .graph-node-clickable { cursor: pointer; }
      .graph-node-clickable:hover { opacity: 0.8; }
    </style>
  </defs>\n`
  
  // Render edges
  svg += '<g class="graph-edges">\n'
  for (const edge of layout.edges) {
    for (const section of edge.sections) {
      let path = `M${section.startPoint.x + padding},${section.startPoint.y + padding}`
      
      if (section.bendPoints && section.bendPoints.length > 0) {
        for (const bend of section.bendPoints) {
          path += ` L${bend.x + padding},${bend.y + padding}`
        }
      }
      
      path += ` L${section.endPoint.x + padding},${section.endPoint.y + padding}`
      
      svg += `  <path d="${path}" class="graph-edge" />\n`
    }
  }
  svg += '</g>\n'
  
  // Render nodes
  svg += '<g class="graph-nodes">\n'
  for (const node of layout.nodes) {
    const cx = node.x + node.width / 2 + padding
    const cy = node.y + node.height / 2 + padding
    const color = getBranchColor(node.branchId)
    const nodeClass = node.hasError 
      ? 'graph-node graph-node-error' 
      : `graph-node ${node.branchId === 'main' ? 'graph-node-main' : 'graph-node-branch'}`
    
    if (interactive) {
      svg += `  <a href="#message-${node.id}" hx-get="/dashboard/conversation/${node.id}/focus" hx-target="#conversation-messages" hx-swap="innerHTML" hx-push-url="false">\n`
    }
    
    svg += `    <circle cx="${cx}" cy="${cy}" r="${nodeRadius}" class="${nodeClass}${interactive ? ' graph-node-clickable' : ''}" style="${node.branchId !== 'main' && !node.hasError ? `fill: ${color};` : ''}" />\n`
    
    // Add timestamp label
    const time = node.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    svg += `    <text x="${cx}" y="${cy - 12}" text-anchor="middle" class="graph-node-label">${time}</text>\n`
    
    if (interactive) {
      svg += `  </a>\n`
    }
  }
  svg += '</g>\n'
  
  svg += '</svg>'
  
  return svg
}