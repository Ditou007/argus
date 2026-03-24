#!/usr/bin/env bash
set -euo pipefail

# Rebuild and redeploy a single Argus service into Kind
# Usage: ./k8s/rebuild.sh api|ingestion|agent

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLUSTER_NAME="argus"

SERVICE="${1:-}"

case "$SERVICE" in
  api)
    echo "Rebuilding argus-api..."
    cd "$REPO_ROOT"
    docker build -t argus-api:local -f packages/api/Dockerfile . --quiet
    kind load docker-image argus-api:local --name "$CLUSTER_NAME" > /dev/null 2>&1
    kubectl rollout restart deploy/argus-api
    kubectl rollout status deploy/argus-api --timeout=60s
    echo "Done."
    ;;
  ingestion)
    echo "Rebuilding argus-ingestion..."
    cd "$REPO_ROOT"
    docker build -t argus-ingestion:local -f packages/ingestion/Dockerfile . --quiet
    kind load docker-image argus-ingestion:local --name "$CLUSTER_NAME" > /dev/null 2>&1
    kubectl rollout restart deploy/argus-ingestion
    kubectl rollout status deploy/argus-ingestion --timeout=60s
    echo "Done."
    ;;
  agent)
    echo "Rebuilding sample-agent..."
    cd "$REPO_ROOT"
    docker build -t argus-sample-agent:local -f sample-agent/Dockerfile . --quiet
    kind load docker-image argus-sample-agent:local --name "$CLUSTER_NAME" > /dev/null 2>&1
    kubectl delete job sample-agent --ignore-not-found
    kubectl apply -f "$SCRIPT_DIR/sample-agent-job.yaml"
    echo "Done. Watch logs: kubectl logs -f job/sample-agent"
    ;;
  *)
    echo "Usage: $0 <api|ingestion|agent>"
    echo ""
    echo "Examples:"
    echo "  $0 api        # Rebuild and redeploy the API"
    echo "  $0 ingestion  # Rebuild and redeploy the ingestion service"
    echo "  $0 agent      # Rebuild and run the sample agent Job"
    exit 1
    ;;
esac
