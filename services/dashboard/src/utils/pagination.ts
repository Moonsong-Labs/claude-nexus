/**
 * Pagination utility functions
 */

export interface PaginationInfo {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
  startIndex: number
  endIndex: number
}

/**
 * Calculate pagination information
 */
export function calculatePagination(page: number, limit: number, total: number): PaginationInfo {
  const totalPages = Math.ceil(total / limit)
  const startIndex = (page - 1) * limit
  const endIndex = Math.min(startIndex + limit, total)

  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
    startIndex,
    endIndex,
  }
}

/**
 * Generate pagination HTML
 */
export function renderPagination(
  currentPage: number,
  totalPages: number,
  baseUrl: string,
  queryParams: Record<string, any> = {}
): string {
  if (totalPages <= 1) {
    return ''
  }

  const params = new URLSearchParams(queryParams)
  const getPageUrl = (page: number) => {
    params.set('page', page.toString())
    return `${baseUrl}?${params.toString()}`
  }

  let html = '<div class="pagination">'

  // Previous page
  if (currentPage > 1) {
    html += `<a href="${getPageUrl(currentPage - 1)}" class="pagination-link">Previous</a>`
  } else {
    html += '<span class="pagination-disabled">Previous</span>'
  }

  // Page numbers
  const maxVisible = 5
  let start = Math.max(1, currentPage - Math.floor(maxVisible / 2))
  const end = Math.min(totalPages, start + maxVisible - 1)

  if (end - start < maxVisible - 1) {
    start = Math.max(1, end - maxVisible + 1)
  }

  if (start > 1) {
    html += `<a href="${getPageUrl(1)}" class="pagination-link">1</a>`
    if (start > 2) {
      html += '<span class="pagination-disabled">...</span>'
    }
  }

  for (let i = start; i <= end; i++) {
    if (i === currentPage) {
      html += `<span class="pagination-current">${i}</span>`
    } else {
      html += `<a href="${getPageUrl(i)}" class="pagination-link">${i}</a>`
    }
  }

  if (end < totalPages) {
    if (end < totalPages - 1) {
      html += '<span class="pagination-disabled">...</span>'
    }
    html += `<a href="${getPageUrl(totalPages)}" class="pagination-link">${totalPages}</a>`
  }

  // Next page
  if (currentPage < totalPages) {
    html += `<a href="${getPageUrl(currentPage + 1)}" class="pagination-link">Next</a>`
  } else {
    html += '<span class="pagination-disabled">Next</span>'
  }

  html += '</div>'
  return html
}
