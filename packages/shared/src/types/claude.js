/**
 * TypeScript interfaces for Claude API types
 */
// Type guards
export function isClaudeError(response) {
    return response && typeof response === 'object' && 'error' in response;
}
export function isStreamEvent(data) {
    return data && typeof data === 'object' && 'type' in data;
}
export function hasToolUse(content) {
    return content.some(c => c.type === 'tool_use');
}
// Request validation
export function validateClaudeRequest(request) {
    if (!request || typeof request !== 'object')
        return false;
    // Required fields
    if (!request.model || typeof request.model !== 'string')
        return false;
    if (!Array.isArray(request.messages) || request.messages.length === 0)
        return false;
    if (!request.max_tokens || typeof request.max_tokens !== 'number')
        return false;
    // Validate messages
    for (const message of request.messages) {
        if (!message.role || !['user', 'assistant', 'system'].includes(message.role))
            return false;
        if (!message.content && message.content !== '')
            return false;
    }
    // Optional fields validation
    if (request.stream !== undefined && typeof request.stream !== 'boolean')
        return false;
    if (request.temperature !== undefined &&
        (typeof request.temperature !== 'number' || request.temperature < 0 || request.temperature > 1)) {
        return false;
    }
    return true;
}
// Helper to count system messages
export function countSystemMessages(request) {
    let count = request.system ? 1 : 0;
    count += request.messages.filter(m => m.role === 'system').length;
    return count;
}
