import {
  ConversationGraph,
  GraphLayout,
  LayoutNode,
  LayoutEdge,
  ConversationNode,
} from './conversation-graph.js'

// Layout dimensions for graph nodes
const LAYOUT_DIMENSIONS = {
  NODE_WIDTH: 160, // Width of each node in pixels
  NODE_HEIGHT: 32, // Height of each node in pixels
  HORIZONTAL_SPACING: 180, // Horizontal space between branches
  VERTICAL_SPACING: 80, // Vertical space between parent and child nodes
} as const

/**
 * Calculates the layout for a conversation graph using a tree-like structure.
 * Positions nodes hierarchically with support for branches, ensuring no overlapping
 * by assigning different horizontal lanes to different branches.
 *
 * @param graph - The conversation graph containing nodes and edges to layout
 * @returns GraphLayout with positioned nodes and edges
 */
export function calculateSimpleLayout(graph: ConversationGraph): GraphLayout {
  const { NODE_WIDTH, NODE_HEIGHT, HORIZONTAL_SPACING, VERTICAL_SPACING } = LAYOUT_DIMENSIONS

  // Build parent-child relationships
  const childrenMap = new Map<string | undefined, string[]>()
  const nodeMap = new Map<string, ConversationNode>()

  graph.nodes.forEach(node => {
    nodeMap.set(node.id, node)
    const children = childrenMap.get(node.parentId) || []
    children.push(node.id)
    childrenMap.set(node.parentId, children)
  })

  // Find root nodes (nodes without parents)
  const roots = graph.nodes.filter(node => !node.parentId).map(n => n.id)

  // Track branch lanes to avoid overlapping
  const branchLanes = new Map<string, number>()
  let nextLane = 0

  // Position nodes
  const layoutNodes: LayoutNode[] = []
  const visitedNodes = new Set<string>()

  function positionNode(nodeId: string, x: number, y: number): number {
    if (visitedNodes.has(nodeId)) {
      return x
    }
    visitedNodes.add(nodeId)

    const node = nodeMap.get(nodeId)
    if (!node) {
      return x
    }

    // Assign lane to branch
    if (!branchLanes.has(node.branchId)) {
      branchLanes.set(node.branchId, nextLane++)
    }

    // Position the node
    layoutNodes.push({
      id: node.id,
      x,
      y,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
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
      isSubtask: node.isSubtask,
      hasSubtasks: node.hasSubtasks,
      subtaskCount: node.subtaskCount,
      hasUserMessage: node.hasUserMessage,
    })

    // Position children
    const children = childrenMap.get(nodeId) || []
    let childX = x

    children.forEach(childId => {
      const child = nodeMap.get(childId)
      if (!child) {
        return
      }

      // If branch changes, offset horizontally
      if (child.branchId !== node.branchId) {
        const childLane = branchLanes.get(child.branchId) || 0
        const parentLane = branchLanes.get(node.branchId) || 0
        const laneDiff = childLane - parentLane
        // Always offset branches to the right to keep them visible
        childX = x + Math.abs(laneDiff) * HORIZONTAL_SPACING
      }

      const nextY = y + VERTICAL_SPACING
      childX = positionNode(childId, childX, nextY)
    })

    return Math.max(x, childX)
  }

  // Position all trees
  let currentX = 0
  roots.forEach(rootId => {
    currentX = positionNode(rootId, currentX, 0) + HORIZONTAL_SPACING
  })

  // Create edges
  const layoutEdges: LayoutEdge[] = []
  graph.edges.forEach(edge => {
    const sourceNode = layoutNodes.find(n => n.id === edge.source)
    const targetNode = layoutNodes.find(n => n.id === edge.target)

    if (sourceNode && targetNode) {
      // Create a path that goes from bottom of source to top of target
      const startX = sourceNode.x + sourceNode.width / 2
      const startY = sourceNode.y + sourceNode.height
      const endX = targetNode.x + targetNode.width / 2
      const endY = targetNode.y

      layoutEdges.push({
        id: `${edge.source}-${edge.target}`,
        source: edge.source,
        target: edge.target,
        sections: [
          {
            startPoint: {
              x: startX,
              y: startY,
            },
            endPoint: {
              x: endX,
              y: endY,
            },
          },
        ],
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
