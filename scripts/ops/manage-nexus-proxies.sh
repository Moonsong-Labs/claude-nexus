#!/bin/bash

# Script to manage claude-nexus-proxy Docker containers across all Nexus Proxy EC2 instances
# Dynamically fetches EC2 instances from AWS

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to display usage
usage() {
    echo "Usage: $0 {up|down|status} [server-name]"
    echo ""
    echo "Commands:"
    echo "  up      - Enable/start the claude-nexus-proxy container"
    echo "  down    - Disable/stop the claude-nexus-proxy container"
    echo "  status  - Check the status of the claude-nexus-proxy container"
    echo ""
    echo "Options:"
    echo "  server-name - Optional. If not provided, the command will run on all servers"
    echo ""
    echo "The script will dynamically fetch all EC2 instances with 'Nexus Proxy' in their name."
    exit 1
}

# Check if at least one argument is provided
if [ $# -eq 0 ]; then
    usage
fi

COMMAND=$1
SERVER_NAME=$2

# Validate command
if [[ ! "$COMMAND" =~ ^(up|down|status)$ ]]; then
    echo -e "${RED}Error: Invalid command '$COMMAND'${NC}"
    usage
fi

# Check if AWS CLI is configured
aws sts get-caller-identity &>/dev/null
if [ $? -ne 0 ]; then
    echo -e "${RED}Error: AWS CLI is not configured. Please run 'aws configure' first.${NC}"
    exit 1
fi

# Global variable for instances
declare -g INSTANCES=""

# Function to fetch EC2 instances
fetch_ec2_instances() {
    echo -e "${YELLOW}Fetching EC2 instances from AWS...${NC}"
    
    # Get instances with Nexus Proxy in their name - store as JSON array
    local raw_instances=$(aws ec2 describe-instances --output json | jq -c '
        [.Reservations[].Instances[] | 
        select(.Tags[]?.Value | ascii_downcase | contains("nexus") and contains("proxy")) | 
        select(.State.Name == "running") |
        {
            Name: (.Tags[] | select(.Key=="Name").Value),
            PublicIP: .PublicIpAddress,
            InstanceId: .InstanceId
        } | 
        select(.PublicIP != null)]
    ')
    
    if [ "$raw_instances" = "[]" ] || [ -z "$raw_instances" ]; then
        echo -e "${RED}No running EC2 instances found with 'Nexus Proxy' in their name.${NC}"
        exit 1
    fi
    
    # Store instances for later use
    INSTANCES="$raw_instances"
    
    echo -e "${GREEN}Found EC2 instances:${NC}"
    echo "$INSTANCES" | jq -r '.[] | "\(.Name) (\(.PublicIP))"'
    echo ""
}

# Function to execute command on a single server (background version)
execute_on_server_async() {
    local name=$1
    local ip=$2
    local cmd=$3
    local output_file=$4
    
    {
        echo -e "${YELLOW}Connecting to $name ($ip)...${NC}"
        
        case $cmd in
            "up")
                ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ubuntu@$ip \
                    "cd ~/claude-nexus-proxy && ./scripts/update-proxy.sh latest proxy" 2>&1
                ;;
            "down")
                ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ubuntu@$ip \
                    "docker stop claude-nexus-proxy 2>/dev/null || true" 2>&1
                ;;
            "status")
                ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ubuntu@$ip \
                    "docker ps -a --filter name=claude-nexus-proxy --format 'table {{.Names}}\t{{.Status}}'" 2>&1
                ;;
        esac
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}✓ $name: Command executed successfully${NC}"
        else
            echo -e "${RED}✗ $name: Command failed or connection timeout${NC}"
        fi
        echo ""
    } > "$output_file" 2>&1
}

# Function to execute command on a single server (synchronous)
execute_on_server() {
    local name=$1
    local ip=$2
    local cmd=$3
    
    echo -e "${YELLOW}Connecting to $name ($ip)...${NC}"
    
    case $cmd in
        "up")
            ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ubuntu@$ip \
                "cd ~/claude-nexus-proxy && ./scripts/update-proxy.sh latest proxy" 2>&1
            ;;
        "down")
            ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ubuntu@$ip \
                "docker stop claude-nexus-proxy 2>/dev/null || true" 2>&1
            ;;
        "status")
            ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 ubuntu@$ip \
                "docker ps -a --filter name=claude-nexus-proxy --format 'table {{.Names}}\t{{.Status}}'" 2>&1
            ;;
    esac
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ $name: Command executed successfully${NC}"
    else
        echo -e "${RED}✗ $name: Command failed or connection timeout${NC}"
    fi
    echo ""
}

# Main execution
echo -e "${GREEN}=== Claude Nexus Proxy Manager ===${NC}"
echo ""

# Fetch EC2 instances
fetch_ec2_instances

# If server name is provided, execute on that server only
if [ -n "$SERVER_NAME" ]; then
    # Check if server exists
    SERVER_INFO=$(echo "$INSTANCES" | jq -r --arg name "$SERVER_NAME" '.[] | select(.Name == $name)')
    
    if [ -z "$SERVER_INFO" ]; then
        echo -e "${RED}Error: Server '$SERVER_NAME' not found${NC}"
        echo ""
        echo "Available servers:"
        echo "$INSTANCES" | jq -r '.[].Name'
        exit 1
    fi
    
    IP=$(echo "$SERVER_INFO" | jq -r '.PublicIP')
    execute_on_server "$SERVER_NAME" "$IP" "$COMMAND"
else
    # Execute on all servers
    echo -e "${YELLOW}Executing '$COMMAND' on all servers concurrently...${NC}"
    echo ""
    
    # Create temp directory for output files
    TEMP_DIR=$(mktemp -d)
    trap "rm -rf $TEMP_DIR" EXIT
    
    # Process each instance in the JSON array
    # Get the number of instances
    NUM_INSTANCES=$(echo "$INSTANCES" | jq 'length')
    
    # Arrays to store PIDs and server info
    declare -a PIDS=()
    declare -a NAMES=()
    declare -a OUTPUT_FILES=()
    
    # Launch all SSH connections in parallel
    for ((i=0; i<$NUM_INSTANCES; i++)); do
        INSTANCE=$(echo "$INSTANCES" | jq -c ".[$i]")
        NAME=$(echo "$INSTANCE" | jq -r '.Name')
        IP=$(echo "$INSTANCE" | jq -r '.PublicIP')
        OUTPUT_FILE="$TEMP_DIR/output_$i.txt"
        
        # Execute in background
        execute_on_server_async "$NAME" "$IP" "$COMMAND" "$OUTPUT_FILE" &
        PIDS+=($!)
        NAMES+=("$NAME")
        OUTPUT_FILES+=("$OUTPUT_FILE")
    done
    
    # Wait for all background jobs to complete
    echo -e "${YELLOW}Waiting for all servers to respond...${NC}"
    echo ""
    
    # Wait for all PIDs
    for pid in "${PIDS[@]}"; do
        wait $pid
    done
    
    # Display results in order
    for ((i=0; i<${#OUTPUT_FILES[@]}; i++)); do
        if [ -f "${OUTPUT_FILES[$i]}" ]; then
            cat "${OUTPUT_FILES[$i]}"
        fi
    done
fi

echo -e "${GREEN}=== Operation completed ===${NC}"