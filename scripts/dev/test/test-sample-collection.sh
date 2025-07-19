#!/bin/bash
# test-sample-collection.sh - Test the proxy's test sample collection feature
#
# Purpose:
#   Verifies that the Claude Nexus Proxy correctly collects request/response
#   samples when COLLECT_TEST_SAMPLES is enabled. These samples are used for
#   test development and debugging.
#
# Prerequisites:
#   - Claude Nexus Proxy must be running
#   - CLAUDE_API_KEY environment variable must be set
#   - curl and jq must be installed
#
# Usage:
#   ./test-sample-collection.sh [PROXY_URL]
#
# Environment Variables:
#   PROXY_URL - URL of the proxy (default: http://localhost:3000)
#   CLAUDE_API_KEY - API key for Claude (required)
#   TEST_SAMPLES_DIR - Directory for samples (default: test-samples)
#
# Exit Codes:
#   0 - Success, samples collected
#   1 - General failure
#   2 - Prerequisites not met
#   3 - Request failed
#   4 - No samples collected

set -eo pipefail

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m' # No Color

# Configuration
readonly PROXY_URL="${1:-${PROXY_URL:-http://localhost:3000}}"
readonly TEST_SAMPLES_DIR="${TEST_SAMPLES_DIR:-test-samples}"

# Functions
print_error() {
    echo -e "${RED}ERROR: $1${NC}" >&2
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}WARNING: $1${NC}"
}

print_info() {
    echo -e "INFO: $1"
}

check_prerequisites() {
    local has_error=false

    # Check for curl
    if ! command -v curl &> /dev/null; then
        print_error "curl is not installed"
        has_error=true
    fi

    # Check for jq
    if ! command -v jq &> /dev/null; then
        print_error "jq is not installed"
        has_error=true
    fi

    # Check for API key
    if [ -z "${CLAUDE_API_KEY}" ]; then
        print_error "CLAUDE_API_KEY environment variable is not set"
        has_error=true
    fi

    # Check if proxy is running
    if ! curl -s -o /dev/null -w "%{http_code}" "${PROXY_URL}/health" | grep -q "200"; then
        print_error "Proxy is not running at ${PROXY_URL}"
        print_info "Please start the proxy with: bun run dev:proxy"
        has_error=true
    fi

    if [ "${has_error}" = true ]; then
        exit 2
    fi
}

cleanup_samples_dir() {
    if [ -d "${TEST_SAMPLES_DIR}" ]; then
        print_warning "Test samples directory exists: ${TEST_SAMPLES_DIR}"
        read -p "Remove existing samples? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf "${TEST_SAMPLES_DIR}"
            print_success "Removed existing samples directory"
        else
            print_info "Keeping existing samples"
        fi
    fi
}

main() {
    print_info "Test Sample Collection Verification"
    print_info "===================================="
    print_info "Proxy URL: ${PROXY_URL}"
    print_info "Samples Directory: ${TEST_SAMPLES_DIR}"
    echo

    # Check prerequisites
    print_info "Checking prerequisites..."
    check_prerequisites
    print_success "All prerequisites met"
    echo

    # Enable test sample collection
    export COLLECT_TEST_SAMPLES=true

    # Clean up any existing samples
    cleanup_samples_dir
    echo

    # Make a test request
    print_info "Making test request to collect samples..."
    local response
    local http_code
    
    response=$(curl -s -w "\n%{http_code}" -X POST "${PROXY_URL}/v1/messages" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${CLAUDE_API_KEY}" \
        -H "anthropic-version: 2023-06-01" \
        -d '{
            "model": "claude-3-haiku-20240307",
            "messages": [{"role": "user", "content": "Hello, this is a test for sample collection"}],
            "max_tokens": 100
        }' 2>&1) || {
        print_error "Request failed with exit code $?"
        exit 3
    }
    
    # Extract HTTP status code (last line)
    http_code=$(echo "${response}" | tail -n1)
    
    # Check HTTP status
    if [ "${http_code}" -ge 200 ] && [ "${http_code}" -lt 300 ]; then
        print_success "Request successful (HTTP ${http_code})"
    else
        print_error "Request failed with HTTP ${http_code}"
        echo "${response}" | head -n-1
        exit 3
    fi
    echo

    # Wait for samples to be written
    print_info "Waiting for samples to be written..."
    sleep 2

    # Check collected samples
    print_info "Checking collected samples..."
    if [ -d "${TEST_SAMPLES_DIR}" ]; then
        local sample_count
        sample_count=$(find "${TEST_SAMPLES_DIR}" -name "*.json" 2>/dev/null | wc -l)
        
        if [ "${sample_count}" -gt 0 ]; then
            print_success "Samples collected: ${sample_count} file(s)"
            echo
            print_info "Sample files:"
            ls -la "${TEST_SAMPLES_DIR}/"*.json 2>/dev/null | while read -r line; do
                echo "  ${line}"
            done
            
            # Show the content of the first sample
            echo
            print_info "First sample content (truncated):"
            local first_sample
            first_sample=$(find "${TEST_SAMPLES_DIR}" -name "*.json" | head -n1)
            if [ -n "${first_sample}" ]; then
                jq -C '.' "${first_sample}" | head -20
                echo "  ..."
                print_info "Full sample available at: ${first_sample}"
            fi
            
            print_success "Test sample collection is working correctly!"
            exit 0
        else
            print_error "No samples found in ${TEST_SAMPLES_DIR}"
            exit 4
        fi
    else
        print_error "Test samples directory was not created"
        print_info "Ensure COLLECT_TEST_SAMPLES is enabled in the proxy"
        exit 4
    fi
}

# Run main function
main "$@"