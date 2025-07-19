#!/bin/bash
#
# manage-nexus-proxies.sh - Manage Claude Nexus Proxy Docker containers across AWS EC2 instances
#
# This script dynamically fetches EC2 instances tagged with "Nexus Proxy" in their name
# and allows you to manage their Docker containers remotely via SSH.
#
# Usage: ./manage-nexus-proxies.sh [--env {prod|staging}] {up|down|status|exec} [server-name|command]
#
# Commands:
#   up      - Pull latest code and start/update the proxy container
#   down    - Stop the proxy container
#   status  - Check container status
#   exec    - Execute arbitrary bash commands on servers
#
# Options:
#   --env {prod|staging} - Filter servers by environment tag
#   server-name         - Target specific server (optional)
#
# Examples:
#   ./manage-nexus-proxies.sh status
#   ./manage-nexus-proxies.sh --env prod up
#   ./manage-nexus-proxies.sh exec "docker ps"
#
# Requirements:
#   - AWS CLI configured with appropriate permissions
#   - SSH access to EC2 instances
#   - EC2 instances tagged with Name containing "Nexus Proxy"
#   - Optional: env tag set to "prod" or "staging" for filtering

set -euo pipefail

# Configuration
readonly SCRIPT_NAME=$(basename "$0")
readonly SSH_TIMEOUT="${SSH_TIMEOUT:-10}"
readonly SSH_USER="${SSH_USER:-ubuntu}"
readonly RETRY_ATTEMPTS="${RETRY_ATTEMPTS:-3}"
readonly RETRY_DELAY="${RETRY_DELAY:-5}"

# SSH options for security and reliability
# Note: StrictHostKeyChecking=no is used for dynamic EC2 instances
# Consider using known_hosts management in production
readonly SSH_OPTIONS=(
    -o "StrictHostKeyChecking=${STRICT_HOST_KEY_CHECK:-no}"
    -o "ConnectTimeout=${SSH_TIMEOUT}"
    -o "BatchMode=yes"
    -o "LogLevel=ERROR"
)

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly MAGENTA='\033[0;35m'
readonly NC='\033[0m' # No Color

# Global variables
declare -g INSTANCES=""
declare -g ENV_FILTER=""
declare -g COMMAND=""
declare -g SERVER_NAME=""
declare -g EXEC_COMMAND=""

# Output functions
log_info() {
    echo -e "${BLUE}$*${NC}" >&2
}

log_success() {
    echo -e "${GREEN}✓ $*${NC}" >&2
}

log_warning() {
    echo -e "${YELLOW}⚠ $*${NC}" >&2
}

log_error() {
    echo -e "${RED}✗ $*${NC}" >&2
}

die() {
    log_error "$@"
    exit 1
}

# Display usage information
usage() {
    cat << EOF
Usage: $SCRIPT_NAME [--env {prod|staging}] {up|down|status|exec} [server-name|command]

Commands:
  up      - Enable/start the claude-nexus-proxy container
  down    - Disable/stop the claude-nexus-proxy container
  status  - Check the status of the claude-nexus-proxy container
  exec    - Execute a bash command on the server(s)

Options:
  --env {prod|staging} - Filter servers by environment tag (optional)
  server-name          - Optional. If not provided, the command will run on all servers

Examples:
  $SCRIPT_NAME status                       # Check status on all servers
  $SCRIPT_NAME --env prod up               # Start proxy on all production servers
  $SCRIPT_NAME --env staging status server1 # Check status on specific staging server
  $SCRIPT_NAME exec "ls -la"               # List files on all servers
  $SCRIPT_NAME exec "docker ps"            # Show docker containers on all servers
  $SCRIPT_NAME exec server1 "df -h"        # Check disk space on specific server

The script will dynamically fetch EC2 instances with 'Nexus Proxy' in their name,
filtered by environment tag if specified.
EOF
    exit 1
}

# Parse command line arguments
parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --env)
                if [[ -z "${2:-}" ]] || [[ "$2" == --* ]]; then
                    die "Error: --env requires a value (prod or staging)"
                fi
                ENV_FILTER="$2"
                if [[ ! "$ENV_FILTER" =~ ^(prod|staging)$ ]]; then
                    die "Error: Invalid environment '$ENV_FILTER'. Must be 'prod' or 'staging'"
                fi
                shift 2
                ;;
            up|down|status)
                if [[ -n "$COMMAND" ]]; then
                    die "Error: Command already specified as '$COMMAND'"
                fi
                COMMAND="$1"
                shift
                # Check if next argument is a server name
                if [[ -n "${1:-}" ]] && [[ ! "$1" == -* ]]; then
                    SERVER_NAME="$1"
                    shift
                fi
                ;;
            exec)
                if [[ -n "$COMMAND" ]]; then
                    die "Error: Command already specified as '$COMMAND'"
                fi
                COMMAND="$1"
                shift
                # Check if next argument is server name or command
                if [[ -n "${1:-}" ]] && [[ "$#" -gt 1 ]]; then
                    # If there are more arguments, first might be server name
                    local potential_server="$1"
                    shift
                    # Check if this looks like a command (contains spaces or special chars)
                    if [[ "$*" =~ [[:space:]] ]] || [[ -n "$*" ]]; then
                        # Assume first arg was server name if we have a command after it
                        SERVER_NAME="$potential_server"
                        EXEC_COMMAND="$*"
                    else
                        # Single argument after exec, treat as command
                        EXEC_COMMAND="$potential_server $*"
                    fi
                elif [[ -n "${1:-}" ]]; then
                    # Single argument, treat as command
                    EXEC_COMMAND="$1"
                fi
                break
                ;;
            -h|--help)
                usage
                ;;
            *)
                die "Error: Unknown option or command '$1'"
                ;;
        esac
    done

    # Validate required arguments
    if [[ -z "$COMMAND" ]]; then
        die "Error: No command specified"
    fi

    if [[ "$COMMAND" == "exec" ]] && [[ -z "$EXEC_COMMAND" ]]; then
        die "Error: 'exec' command requires a bash command to execute"
    fi
}

# Check AWS CLI availability and configuration
check_aws_cli() {
    if ! command -v aws &> /dev/null; then
        die "Error: AWS CLI is not installed. Please install it first."
    fi

    if ! aws sts get-caller-identity &> /dev/null; then
        die "Error: AWS CLI is not configured. Please run 'aws configure' first."
    fi
}

# Fetch EC2 instances from AWS
fetch_ec2_instances() {
    local env_display=""
    if [[ -n "$ENV_FILTER" ]]; then
        if [[ "$ENV_FILTER" == "prod" ]]; then
            env_display="${RED}PRODUCTION${NC}"
        else
            env_display="${YELLOW}STAGING${NC}"
        fi
        log_info "Fetching ${env_display} EC2 instances from AWS..."
    else
        log_info "Fetching EC2 instances from AWS (all environments)..."
    fi
    
    # Build jq filter based on whether env filter is specified
    local jq_filter='
        [.Reservations[].Instances[] | 
        select(.Tags[]?.Value | ascii_downcase | contains("nexus") and contains("proxy")) | 
        select(.State.Name == "running") |
        {
            Name: (.Tags[] | select(.Key=="Name").Value),
            PublicIP: .PublicIpAddress,
            InstanceId: .InstanceId,
            Environment: ((.Tags[] | select(.Key=="env").Value) // "unknown")
        }'
    
    # Add environment filter if specified
    if [[ -n "$ENV_FILTER" ]]; then
        jq_filter+=' | select(.Environment == "'$ENV_FILTER'")'
    fi
    
    jq_filter+=' | select(.PublicIP != null)]'
    
    # Get instances with Nexus Proxy in their name
    local raw_instances
    raw_instances=$(aws ec2 describe-instances --output json | jq -c "$jq_filter")
    
    if [[ "$raw_instances" == "[]" ]] || [[ -z "$raw_instances" ]]; then
        if [[ -n "$ENV_FILTER" ]]; then
            die "No running EC2 instances found with 'Nexus Proxy' in their name and env='$ENV_FILTER'."
        else
            die "No running EC2 instances found with 'Nexus Proxy' in their name."
        fi
    fi
    
    # Store instances for later use
    INSTANCES="$raw_instances"
    
    log_success "Found EC2 instances:"
    echo "$INSTANCES" | jq -r '.[] | 
        if .Environment == "prod" then
            "\(.Name) (\(.PublicIP)) [\u001b[0;31mPROD\u001b[0m]"
        elif .Environment == "staging" then
            "\(.Name) (\(.PublicIP)) [\u001b[1;33mSTAGING\u001b[0m]"
        else
            "\(.Name) (\(.PublicIP)) [unknown]"
        end'
    echo ""
}

# Execute SSH command with retry logic
execute_ssh_command() {
    local ip=$1
    local cmd=$2
    local attempt=1
    
    while [[ $attempt -le $RETRY_ATTEMPTS ]]; do
        if ssh "${SSH_OPTIONS[@]}" "${SSH_USER}@${ip}" "$cmd" 2>&1; then
            return 0
        fi
        
        if [[ $attempt -lt $RETRY_ATTEMPTS ]]; then
            log_warning "SSH connection failed (attempt $attempt/$RETRY_ATTEMPTS). Retrying in ${RETRY_DELAY}s..."
            sleep "$RETRY_DELAY"
        fi
        ((attempt++))
    done
    
    return 1
}

# Execute command on a single server
execute_on_server() {
    local name=$1
    local ip=$2
    local cmd=$3
    local env=$4
    local async=${5:-false}
    
    # Format environment display
    local env_display=""
    if [[ "$env" == "prod" ]]; then
        env_display=" ${RED}[PROD]${NC}"
    elif [[ "$env" == "staging" ]]; then
        env_display=" ${YELLOW}[STAGING]${NC}"
    elif [[ "$env" != "unknown" ]] && [[ -n "$env" ]]; then
        env_display=" [$env]"
    fi
    
    # Execute based on command type
    if [[ "$async" == "true" ]]; then
        (
            execute_on_server_impl "$name" "$ip" "$cmd" "$env_display"
        ) &
    else
        execute_on_server_impl "$name" "$ip" "$cmd" "$env_display"
    fi
}

# Implementation of server command execution
execute_on_server_impl() {
    local name=$1
    local ip=$2
    local cmd=$3
    local env_display=$4
    
    log_info "Connecting to $name ($ip)$env_display..."
    
    case $cmd in
        "up")
            # Pull latest code before updating
            if execute_ssh_command "$ip" "cd ~/claude-nexus-proxy && git pull origin main"; then
                log_success "Code updated on $name"
                
                # Run the update script
                if execute_ssh_command "$ip" "cd ~ && ./claude-nexus-proxy/scripts/ops/update-proxy.sh latest proxy"; then
                    log_success "$name: Proxy updated successfully"
                else
                    log_error "$name: Failed to update proxy"
                    return 1
                fi
            else
                log_error "$name: Failed to pull latest code. Please resolve git issues before retrying."
                return 1
            fi
            ;;
        "down")
            if execute_ssh_command "$ip" "docker stop claude-nexus-proxy 2>/dev/null || true"; then
                log_success "$name: Proxy stopped"
            else
                log_error "$name: Failed to stop proxy"
                return 1
            fi
            ;;
        "status")
            if execute_ssh_command "$ip" "docker ps -a --filter name=claude-nexus-proxy --format 'table {{.Names}}\t{{.Status}}'"; then
                log_success "$name: Status retrieved"
            else
                log_error "$name: Failed to get status"
                return 1
            fi
            ;;
        "exec")
            if execute_ssh_command "$ip" "$EXEC_COMMAND"; then
                log_success "$name: Command executed successfully"
            else
                log_error "$name: Command failed"
                return 1
            fi
            ;;
    esac
}

# Execute command on specific server
execute_on_single_server() {
    local server_info
    server_info=$(echo "$INSTANCES" | jq -r --arg name "$SERVER_NAME" '.[] | select(.Name == $name)')
    
    if [[ -z "$server_info" ]]; then
        log_error "Server '$SERVER_NAME' not found"
        echo ""
        echo "Available servers:"
        echo "$INSTANCES" | jq -r '.[] | "\(.Name) [" + .Environment + "]"'
        exit 1
    fi
    
    local ip env
    ip=$(echo "$server_info" | jq -r '.PublicIP')
    env=$(echo "$server_info" | jq -r '.Environment')
    
    execute_on_server "$SERVER_NAME" "$ip" "$COMMAND" "$env" "false"
}

# Execute command on all servers
execute_on_all_servers() {
    log_info "Executing '$COMMAND' on all servers..."
    echo ""
    
    # Get the number of instances
    local num_instances
    num_instances=$(echo "$INSTANCES" | jq 'length')
    
    # Arrays to store PIDs for parallel execution
    local pids=()
    
    # Launch all SSH connections in parallel
    for ((i=0; i<num_instances; i++)); do
        local instance name ip env
        instance=$(echo "$INSTANCES" | jq -c ".[$i]")
        name=$(echo "$instance" | jq -r '.Name')
        ip=$(echo "$instance" | jq -r '.PublicIP')
        env=$(echo "$instance" | jq -r '.Environment')
        
        execute_on_server "$name" "$ip" "$COMMAND" "$env" "true"
        pids+=($!)
    done
    
    # Wait for all background jobs to complete
    log_info "Waiting for all servers to respond..."
    local failed=0
    for pid in "${pids[@]}"; do
        if ! wait "$pid"; then
            ((failed++))
        fi
    done
    
    if [[ $failed -gt 0 ]]; then
        log_warning "Command failed on $failed server(s)"
    fi
}

# Main execution
main() {
    echo -e "${GREEN}=== Claude Nexus Proxy Manager ===${NC}"
    
    # Parse arguments
    parse_arguments "$@"
    
    # Display environment filter if set
    if [[ -n "$ENV_FILTER" ]]; then
        if [[ "$ENV_FILTER" == "prod" ]]; then
            echo -e "Environment: ${RED}PRODUCTION${NC}"
        else
            echo -e "Environment: ${YELLOW}STAGING${NC}"
        fi
    else
        echo -e "Environment: ${BLUE}ALL${NC}"
    fi
    echo ""
    
    # Check AWS CLI
    check_aws_cli
    
    # Fetch EC2 instances
    fetch_ec2_instances
    
    # Execute command
    if [[ -n "$SERVER_NAME" ]]; then
        execute_on_single_server
    else
        execute_on_all_servers
    fi
    
    echo ""
    log_success "=== Operation completed ==="
}

# Run main function
main "$@"