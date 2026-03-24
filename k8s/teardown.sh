#!/usr/bin/env bash
set -euo pipefail

# Argus K8s Teardown — deletes the entire Kind cluster
# Usage: ./k8s/teardown.sh

CLUSTER_NAME="argus"

echo "Deleting Kind cluster '$CLUSTER_NAME'..."
kind delete cluster --name "$CLUSTER_NAME"
echo "Done. Cluster and all resources removed."
