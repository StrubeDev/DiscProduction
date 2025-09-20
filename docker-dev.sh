#!/bin/bash
# Docker Development Commands for Jamly Bot

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[JAMLY]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if .env exists
check_env() {
    if [ ! -f .env ]; then
        print_warning ".env file not found. Creating template..."
        cat > .env << EOF
# Discord Bot Configuration
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id_here

# Environment
NODE_ENV=production

# Optional: Database URL (if using external DB)
# DATABASE_URL=postgresql://user:password@localhost:5432/jamly
EOF
        print_warning "Please edit .env with your Discord bot credentials!"
        return 1
    fi
    return 0
}

# Build the Docker image
build() {
    print_status "Building Jamly Docker image..."
    docker build -t jamly-bot .
    print_success "Docker image built successfully!"
}

# Run the bot in development mode with live logs
dev() {
    check_env || exit 1
    print_status "Starting Jamly bot in development mode..."
    docker-compose up --build
}

# Run the bot in background (production-like)
start() {
    check_env || exit 1
    print_status "Starting Jamly bot in background..."
    docker-compose up -d --build
    print_success "Bot started! Use './docker-dev.sh logs' to view output."
}

# Stop the bot
stop() {
    print_status "Stopping Jamly bot..."
    docker-compose down
    print_success "Bot stopped!"
}

# View logs
logs() {
    print_status "Showing Jamly bot logs (Ctrl+C to exit)..."
    docker-compose logs -f jamly-bot
}

# Restart the bot
restart() {
    print_status "Restarting Jamly bot..."
    docker-compose restart jamly-bot
    print_success "Bot restarted!"
}

# Shell into the container
shell() {
    print_status "Opening shell in Jamly container..."
    docker-compose exec jamly-bot /bin/sh
}

# Clean up Docker resources
clean() {
    print_status "Cleaning up Docker resources..."
    docker-compose down --volumes --remove-orphans
    docker system prune -f
    print_success "Cleanup complete!"
}

# Show status
status() {
    print_status "Docker container status:"
    docker-compose ps
    echo ""
    print_status "Recent logs:"
    docker-compose logs --tail=20 jamly-bot
}

# Help
help() {
    echo "🎵 Jamly Discord Bot - Docker Development Commands"
    echo ""
    echo "Usage: ./docker-dev.sh [command]"
    echo ""
    echo "Commands:"
    echo "  build     Build the Docker image"
    echo "  dev       Run in development mode (foreground with logs)"
    echo "  start     Start in background (production-like)"
    echo "  stop      Stop the bot"
    echo "  restart   Restart the bot"
    echo "  logs      Show live logs"
    echo "  shell     Open shell in container"
    echo "  status    Show container status and recent logs"
    echo "  clean     Clean up Docker resources"
    echo "  help      Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./docker-dev.sh dev      # Development with live logs"
    echo "  ./docker-dev.sh start    # Production-like background"
    echo "  ./docker-dev.sh logs     # View logs"
}

# Main command dispatcher
case "$1" in
    build)
        build
        ;;
    dev)
        dev
        ;;
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    logs)
        logs
        ;;
    shell)
        shell
        ;;
    status)
        status
        ;;
    clean)
        clean
        ;;
    help|--help|-h|"")
        help
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        help
        exit 1
        ;;
esac
