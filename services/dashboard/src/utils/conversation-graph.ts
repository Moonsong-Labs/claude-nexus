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
  messageIndex?: number
  messageCount?: number
  toolCallCount?: number
  messageTypes?: string[]
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
  messageIndex?: number
  messageCount?: number
  toolCallCount?: number
  messageTypes?: string[]
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
export async function calculateGraphLayout(graph: ConversationGraph, reversed: boolean = false): Promise<GraphLayout> {
  if (reversed) {
    // For reversed layout, we need a custom approach
    return calculateReversedLayout(graph)
  }
  
  // Use the simple layout algorithm
  return calculateSimpleLayout(graph)
}

/**
 * Calculate layout for reversed tree (newest at top)
 */
function calculateReversedLayout(graph: ConversationGraph): GraphLayout {
  const nodeWidth = 100
  const nodeHeight = 40
  const horizontalSpacing = 120
  const verticalSpacing = 40 // Reduced by 2

  // Build parent-child relationships for branch detection
  const childrenMap = new Map<string | undefined, string[]>()
  const nodeMap = new Map<string, (typeof graph.nodes)[0]>()

  graph.nodes.forEach(node => {
    nodeMap.set(node.id, node)
    const children = childrenMap.get(node.parentId) || []
    children.push(node.id)
    childrenMap.set(node.parentId, children)
  })

  // Track branch lanes
  const branchLanes = new Map<string, number>()
  let nextLane = 0

  // Find max message count to reverse Y positions
  const maxMessageCount = Math.max(...graph.nodes.map(n => n.messageCount || 0))

  // Position nodes based on message count
  const layoutNodes: LayoutNode[] = graph.nodes.map(node => {
    // Assign lane to branch if not already assigned
    if (!branchLanes.has(node.branchId)) {
      branchLanes.set(node.branchId, nextLane++)
    }
    
    const lane = branchLanes.get(node.branchId) || 0
    const messageCount = node.messageCount || 0
    
    // Y position is based on reversed message count (newest at top)
    const y = (maxMessageCount - messageCount) * verticalSpacing
    
    // X position is based on branch lane
    const x = lane * horizontalSpacing
    
    return {
      id: node.id,
      x,
      y,
      width: nodeWidth,
      height: nodeHeight,
      branchId: node.branchId,
      timestamp: node.timestamp,
      label: node.label,
      tokens: node.tokens,
      model: node.model,
      hasError: node.hasError,
      messageIndex: node.messageIndex,
      messageCount: node.messageCount,
      toolCallCount: node.toolCallCount,
      messageTypes: node.messageTypes,
    }
  })

  // Create edges
  const layoutEdges: LayoutEdge[] = []
  graph.edges.forEach((edge, idx) => {
    const sourceNode = layoutNodes.find(n => n.id === edge.source)
    const targetNode = layoutNodes.find(n => n.id === edge.target)

    if (sourceNode && targetNode) {
      // In reversed layout, newer messages (higher count) are above
      layoutEdges.push({
        id: `e${idx}`,
        source: edge.source,
        target: edge.target,
        sections: [{
          startPoint: {
            x: sourceNode.x + sourceNode.width / 2,
            y: sourceNode.y, // Top of source (parent/older)
          },
          endPoint: {
            x: targetNode.x + targetNode.width / 2,
            y: targetNode.y + targetNode.height, // Bottom of target (child/newer)
          },
        }],
      })
    }
  })

  // Calculate bounds
  const minX = Math.min(...layoutNodes.map(n => n.x))
  const maxX = Math.max(...layoutNodes.map(n => n.x + n.width))
  const minY = Math.min(...layoutNodes.map(n => n.y))
  const maxY = Math.max(...layoutNodes.map(n => n.y + n.height))

  return {
    nodes: layoutNodes,
    edges: layoutEdges,
    width: maxX - minX + 100,
    height: maxY - minY + 100,
  }
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
    hash = (hash << 5) - hash + branchId.charCodeAt(i)
    hash = hash & hash // Convert to 32-bit integer
  }

  return colors[Math.abs(hash) % colors.length]
}

/**
 * Render the conversation graph as SVG
 */
export function renderGraphSVG(layout: GraphLayout, interactive: boolean = true): string {
  const padding = 40
  const nodeRadius = 8
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
    const x = node.x + padding
    const y = node.y + padding
    const color = getBranchColor(node.branchId)
    const nodeClass = node.hasError
      ? 'graph-node graph-node-error'
      : `graph-node ${node.branchId === 'main' ? 'graph-node-main' : 'graph-node-branch'}`

    if (interactive) {
      svg += `  <a href="/dashboard/request/${node.id}">\n`
    }

    // Draw rectangle with rounded corners
    svg += `    <rect x="${x}" y="${y}" width="${node.width}" height="${node.height}" rx="6" ry="6" class="${nodeClass}${interactive ? ' graph-node-clickable' : ''}" style="fill: white; stroke: ${node.hasError ? '#ef4444' : color}; stroke-width: 2;" />\n`

    // Add message count number on the left
    if (node.messageCount !== undefined) {
      svg += `    <text x="${x + 12}" y="${y + node.height / 2 + 4}" text-anchor="middle" class="graph-node-label" style="font-weight: 700; font-size: 14px; fill: ${color};">${node.messageCount}</text>\n`
    }

    // Add model label in the center
    const modelShort = node.model.includes('claude-3') ? node.model.split('-')[2] : node.model.split('-').slice(-1)[0]
    svg += `    <text x="${x + node.width / 2 + 5}" y="${y + node.height / 2 - 4}" text-anchor="middle" class="graph-node-label" style="font-weight: 500; font-size: 11px;">${modelShort}</text>\n`
    
    // Add timestamp
    const time = node.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    svg += `    <text x="${x + node.width / 2 + 5}" y="${y + node.height / 2 + 10}" text-anchor="middle" class="graph-node-label" style="font-size: 9px; fill: #6b7280;">${time}</text>\n`

    // Add message type icons on the borders (top-left and top-right)
    if (node.messageTypes && node.messageTypes.length > 0) {
      const iconSize = 10
      const iconOffset = 2 // Distance from border
      
      // Get last 2 message types
      const types = node.messageTypes.slice(-2)
      
      // First icon on top-left
      if (types.length >= 1) {
        const iconX = x + iconOffset
        const iconY = y + iconOffset
        const type = types[types.length - 2] || types[0] // Second to last, or first if only one
        
        if (type === 'tool_use') {
          // Tool icon (wrench)
          svg += `    <text x="${iconX}" y="${iconY + iconSize}" text-anchor="start" class="graph-node-label" style="font-size: ${iconSize}px;" title="Tool use">🔧</text>\n`
        } else if (type === 'tool_result') {
          // Result icon (checkmark)
          svg += `    <text x="${iconX}" y="${iconY + iconSize}" text-anchor="start" class="graph-node-label" style="font-size: ${iconSize}px;" title="Tool result">✅</text>\n`
        } else if (type === 'user' || type === 'text') {
          // User/text icon (page)
          svg += `    <text x="${iconX}" y="${iconY + iconSize}" text-anchor="start" class="graph-node-label" style="font-size: ${iconSize}px;" title="User message">📄</text>\n`
        } else {
          // Assistant icon (robot)
          svg += `    <text x="${iconX}" y="${iconY + iconSize}" text-anchor="start" class="graph-node-label" style="font-size: ${iconSize}px;" title="Assistant message">🤖</text>\n`
        }
      }
      
      // Second icon on top-right
      if (types.length >= 2) {
        const iconX = x + node.width - iconOffset
        const iconY = y + iconOffset
        const type = types[types.length - 1] // Last type
        
        if (type === 'tool_use') {
          // Tool icon (wrench)
          svg += `    <text x="${iconX}" y="${iconY + iconSize}" text-anchor="end" class="graph-node-label" style="font-size: ${iconSize}px;" title="Tool use">🔧</text>\n`
        } else if (type === 'tool_result') {
          // Result icon (checkmark)
          svg += `    <text x="${iconX}" y="${iconY + iconSize}" text-anchor="end" class="graph-node-label" style="font-size: ${iconSize}px;" title="Tool result">✅</text>\n`
        } else if (type === 'user' || type === 'text') {
          // User/text icon (page)
          svg += `    <text x="${iconX}" y="${iconY + iconSize}" text-anchor="end" class="graph-node-label" style="font-size: ${iconSize}px;" title="User message">📄</text>\n`
        } else {
          // Assistant icon (robot)
          svg += `    <text x="${iconX}" y="${iconY + iconSize}" text-anchor="end" class="graph-node-label" style="font-size: ${iconSize}px;" title="Assistant message">🤖</text>\n`
        }
      }
    }

    // Add connection point at the bottom
    svg += `    <circle cx="${x + node.width / 2}" cy="${y + node.height}" r="${nodeRadius - 2}" class="${nodeClass}" style="${node.branchId !== 'main' && !node.hasError ? `fill: ${color};` : ''} stroke: white; stroke-width: 2;" />\n`

    if (interactive) {
      svg += `  </a>\n`
    }
  }
  svg += '</g>\n'

  svg += '</svg>'

  return svg
}
