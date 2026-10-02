#!/bin/bash
set -euo pipefail

NGINX_UPSTREAM_CONF="${NGINX_UPSTREAM_CONF:-/etc/nginx/conf.d/upstream_macos.conf}"
BLUE_PORT="${BLUE_PORT:-3001}"
GREEN_PORT="${GREEN_PORT:-3004}"
CHECK_TIMEOUT="${CHECK_TIMEOUT:-5}"
FAILURE_THRESHOLD="${FAILURE_THRESHOLD:-2}"
SUCCESS_THRESHOLD="${SUCCESS_THRESHOLD:-2}"
COMPOSE_FILE="${COMPOSE_FILE:-/home/ubuntu/MacOS-Production/docker-compose.yml}"
STATE_DIR="${STATE_DIR:-/tmp/macos-healthwatch}"
HEARTBEAT_FILE="${HEALTHWATCH_HEARTBEAT_FILE:-/var/run/macos-healthwatch.heartbeat}"
DEADMAN_ALERT_URL="${HEALTHWATCH_ALERT_URL:-}"
DEADMAN_ALERT_COMMAND="${HEALTHWATCH_ALERT_COMMAND:-}"
mkdir -p "$STATE_DIR"
mkdir -p "$(dirname "$HEARTBEAT_FILE")"
ACTIVE_FAILURES_FILE="$STATE_DIR/active_failures"
STANDBY_SUCCESS_FILE="$STATE_DIR/standby_successes"

log() {
    echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] $*"
}

write_heartbeat() {
    echo "$(date -u +%s)" > "$HEARTBEAT_FILE"
    if [ -d "/home/ubuntu/MacOS-Production/logs" ]; then
        echo "$(date -u +%s)" > "/home/ubuntu/MacOS-Production/logs/healthwatch.heartbeat" 2>/dev/null || true
    fi
}

trigger_deadman_alert() {
    local payload
    payload=$(printf '{"service":"macos-healthwatch","status":"deadman","timestamp":"%s","heartbeat_file":"%s"}' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$HEARTBEAT_FILE")

    if [ -n "$DEADMAN_ALERT_URL" ]; then
        curl -fsS --max-time 10 -H 'Content-Type: application/json' -d "$payload" "$DEADMAN_ALERT_URL" >/dev/null 2>&1 || true
    fi

    if [ -n "$DEADMAN_ALERT_COMMAND" ]; then
        bash -lc "$DEADMAN_ALERT_COMMAND" >/dev/null 2>&1 || true
    fi
}

read_count() {
    local file="$1"
    if [ -f "$file" ]; then
        cat "$file" 2>/dev/null || echo 0
    else
        echo 0
    fi
}

write_count() {
    local file="$1"
    local value="$2"
    printf '%s' "$value" > "$file"
}

get_active_slot() {
    if [ -f "$NGINX_UPSTREAM_CONF" ] && grep -q "127.0.0.1:$GREEN_PORT" "$NGINX_UPSTREAM_CONF"; then
        echo "green"
    else
        echo "blue"
    fi
}

get_standby_slot() {
    local active
    active="$(get_active_slot)"
    if [ "$active" = "green" ]; then
        echo "blue"
    else
        echo "green"
    fi
}

get_port_for_slot() {
    local slot="$1"
    if [ "$slot" = "green" ]; then
        echo "$GREEN_PORT"
    else
        echo "$BLUE_PORT"
    fi
}

check_health_endpoint() {
    local url="$1"
    local code
    code=$(curl -sS --max-time "$CHECK_TIMEOUT" -o /tmp/macos-healthwatch-response.$$ -w '%{http_code}' "$url" || true)
    if [ "$code" = "200" ] && grep -Eq '"status"\s*:\s*"healthy"|"ok"\s*:\s*true' /tmp/macos-healthwatch-response.$$ 2>/dev/null; then
        rm -f /tmp/macos-healthwatch-response.$$
        return 0
    fi
    rm -f /tmp/macos-healthwatch-response.$$
    return 1
}

check_slot() {
    local slot="$1"
    local port
    port="$(get_port_for_slot "$slot")"
    local health_url="http://127.0.0.1:${port}/api/health"
    local healthz_url="http://127.0.0.1:${port}/healthz"

    if check_health_endpoint "$health_url"; then
        return 0
    fi

    if check_health_endpoint "$healthz_url"; then
        return 0
    fi

    return 1
}

switch_nginx_to_slot() {
    local target_slot="$1"
    local target_port
    target_port="$(get_port_for_slot "$target_slot")"

    log "Switching upstream to $target_slot on port $target_port"

    cat <<EOF > /tmp/upstream_macos.conf
# Managed by macos-healthwatch.sh
upstream macos_backend {
    server 127.0.0.1:${target_port} max_fails=2 fail_timeout=5s;
    keepalive 32;
}
EOF

    sudo cp /tmp/upstream_macos.conf "$NGINX_UPSTREAM_CONF"
    sudo chmod 644 "$NGINX_UPSTREAM_CONF"
    if [ -d "/home/ubuntu/MacOS-Production/logs" ]; then
        cp /tmp/upstream_macos.conf /home/ubuntu/MacOS-Production/logs/upstream_macos.conf 2>/dev/null || true
    fi
    rm -f /tmp/upstream_macos.conf
    sudo nginx -t
    sudo systemctl reload nginx || sudo nginx -s reload
}

attempt_recreate_slot() {
    local slot="$1"
    log "Attempting container recreation for $slot"
    docker compose -f "$COMPOSE_FILE" up -d --force-recreate --no-deps "macos-server-$slot" >/dev/null 2>&1 || true
}

main() {
    local active_slot standby_slot active_port standby_port
    local active_failures standby_successes
    local heartbeat_age

    write_heartbeat

    active_slot="$(get_active_slot)"
    standby_slot="$(get_standby_slot)"
    active_port="$(get_port_for_slot "$active_slot")"
    standby_port="$(get_port_for_slot "$standby_slot")"

    if [ -f "$HEARTBEAT_FILE" ]; then
        heartbeat_age=$(( $(date +%s) - $(cat "$HEARTBEAT_FILE" 2>/dev/null || echo 0) ))
        if [ "$heartbeat_age" -gt 180 ]; then
            log "Deadman alarm: watchdog heartbeat is stale (${heartbeat_age}s)."
            trigger_deadman_alert
            exit 1
        fi
    fi

    if check_slot "$active_slot"; then
        write_count "$ACTIVE_FAILURES_FILE" 0
        log "Active slot $active_slot on $active_port is healthy. No failover needed."
        exit 0
    fi

    active_failures=$(($(read_count "$ACTIVE_FAILURES_FILE") + 1))
    write_count "$ACTIVE_FAILURES_FILE" "$active_failures"
    log "Active slot $active_slot on $active_port failed health check #${active_failures}/${FAILURE_THRESHOLD}."

    if [ "$active_failures" -lt "$FAILURE_THRESHOLD" ]; then
        exit 0
    fi

    if check_slot "$standby_slot"; then
        standby_successes=$(($(read_count "$STANDBY_SUCCESS_FILE") + 1))
        write_count "$STANDBY_SUCCESS_FILE" "$standby_successes"
        log "Standby slot $standby_slot on $standby_port is healthy and stable ${standby_successes}/${SUCCESS_THRESHOLD}."

        if [ "$standby_successes" -ge "$SUCCESS_THRESHOLD" ]; then
            write_count "$ACTIVE_FAILURES_FILE" 0
            write_count "$STANDBY_SUCCESS_FILE" 0
            switch_nginx_to_slot "$standby_slot"
            exit 0
        fi

        exit 0
    fi

    write_count "$STANDBY_SUCCESS_FILE" 0
    log "Standby slot $standby_slot is unhealthy; attempting recovery on the active slot."
    attempt_recreate_slot "$active_slot"
    sleep 5

    if check_slot "$active_slot"; then
        write_count "$ACTIVE_FAILURES_FILE" 0
        log "Recovered active slot $active_slot on $active_port."
        exit 0
    fi

    log "Active slot recovery failed. Attempting to start standby slot $standby_slot..."
    attempt_recreate_slot "$standby_slot"
    sleep 5

    if check_slot "$standby_slot"; then
        write_count "$ACTIVE_FAILURES_FILE" 0
        write_count "$STANDBY_SUCCESS_FILE" 0
        log "Standby slot $standby_slot on $standby_port is healthy after recovery; switching traffic."
        switch_nginx_to_slot "$standby_slot"
        exit 0
    fi

    log "ERROR: Neither active nor standby slot is healthy after ${FAILURE_THRESHOLD} consecutive failures. Manual intervention required."
    exit 1
}

main "$@"
