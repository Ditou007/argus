#!/usr/bin/env bash
set -euo pipefail

# Argus K8s Local Setup
# Creates a Kind cluster with Tetragon, Postgres, Redis, and Argus services
# Usage: ./k8s/setup.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLUSTER_NAME="argus"

echo "=================================================="
echo "  Argus — Local Kubernetes Setup"
echo "=================================================="

# --- Step 1: Create Kind cluster ---
echo ""
echo "[1/8] Creating Kind cluster..."
if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
  echo "  Cluster '$CLUSTER_NAME' already exists, skipping creation"
else
  kind create cluster --name "$CLUSTER_NAME" --config "$SCRIPT_DIR/kind-config.yaml"
  echo "  Cluster created"
fi

# Verify kubectl context
kubectl cluster-info --context "kind-${CLUSTER_NAME}" > /dev/null 2>&1
echo "  kubectl context: kind-${CLUSTER_NAME}"

# --- Step 2: Install Tetragon via Helm ---
echo ""
echo "[2/8] Installing Tetragon (eBPF runtime observability)..."
helm repo add cilium https://helm.cilium.io 2>/dev/null || true
helm repo update cilium > /dev/null 2>&1

if helm status tetragon -n kube-system > /dev/null 2>&1; then
  echo "  Tetragon already installed, upgrading..."
  helm upgrade tetragon cilium/tetragon -n kube-system \
    --values "$SCRIPT_DIR/tetragon-values.yaml" --wait --timeout 2m > /dev/null
else
  helm install tetragon cilium/tetragon -n kube-system \
    --values "$SCRIPT_DIR/tetragon-values.yaml" --wait --timeout 2m > /dev/null
fi
echo "  Tetragon DaemonSet ready"

# --- Step 3: Deploy Postgres + Redis ---
echo ""
echo "[3/8] Deploying Postgres and Redis..."
kubectl apply -f "$SCRIPT_DIR/postgres.yaml" -f "$SCRIPT_DIR/redis.yaml" > /dev/null
kubectl wait --for=condition=ready pod -l app=postgres --timeout=60s > /dev/null 2>&1
kubectl wait --for=condition=ready pod -l app=redis --timeout=60s > /dev/null 2>&1
echo "  Postgres and Redis ready"

# --- Step 4: Apply TracingPolicies ---
echo ""
echo "[4/8] Applying Tetragon TracingPolicies..."
kubectl apply -f "$SCRIPT_DIR/policies/" > /dev/null
echo "  TracingPolicies applied (file-tracking, network-tracking)"

# --- Step 5: Build Docker images ---
echo ""
echo "[5/8] Building Docker images..."
cd "$REPO_ROOT"

docker build -t argus-api:local -f packages/api/Dockerfile . --quiet
echo "  argus-api:local built"

docker build -t argus-ingestion:local -f packages/ingestion/Dockerfile . --quiet
echo "  argus-ingestion:local built"

docker build -t argus-sample-agent:local -f sample-agent/Dockerfile . --quiet
echo "  argus-sample-agent:local built"

# --- Step 6: Load images into Kind ---
echo ""
echo "[6/8] Loading images into Kind cluster..."
kind load docker-image argus-api:local --name "$CLUSTER_NAME" > /dev/null 2>&1
kind load docker-image argus-ingestion:local --name "$CLUSTER_NAME" > /dev/null 2>&1
kind load docker-image argus-sample-agent:local --name "$CLUSTER_NAME" > /dev/null 2>&1
echo "  Images loaded"

# --- Step 7: Deploy Argus services ---
echo ""
echo "[7/8] Deploying Argus API and Ingestion..."
kubectl apply -f "$SCRIPT_DIR/api.yaml" -f "$SCRIPT_DIR/ingestion.yaml" > /dev/null
kubectl rollout status deploy/argus-api --timeout=60s > /dev/null 2>&1
kubectl rollout status deploy/argus-ingestion --timeout=60s > /dev/null 2>&1
echo "  Argus services ready"

# --- Step 8: Summary ---
echo ""
echo "[8/8] Setup complete!"
echo ""
echo "=================================================="
echo "  Cluster: kind-${CLUSTER_NAME}"
echo "=================================================="
echo ""
kubectl get pods -o wide
echo ""
echo "--- Next steps ---"
echo ""
echo "  1. Port-forward the API (run in a separate terminal):"
echo "     kubectl port-forward svc/argus-api 3001:3001"
echo ""
echo "  2. Start the dashboard (another terminal):"
echo "     pnpm dev:dashboard"
echo ""
echo "  3. Run the sample agent:"
echo "     kubectl delete job sample-agent --ignore-not-found"
echo "     kubectl apply -f k8s/sample-agent-job.yaml"
echo ""
echo "  4. Watch ingestion logs:"
echo "     kubectl logs -f deploy/argus-ingestion"
echo ""
echo "  5. Teardown:"
echo "     ./k8s/teardown.sh"
echo ""
