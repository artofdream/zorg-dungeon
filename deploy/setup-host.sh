#!/usr/bin/env bash
# Host provisioning script for Zorg Dungeon Lightsail instance (Ubuntu 24.04)
set -euo pipefail

echo "==> Updating system packages..."
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg git

echo "==> Installing Docker Engine..."
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "==> Configuring user permissions..."
sudo usermod -aG docker "$USER" || true

echo "==> Setting up Zorg Dungeon deployment directory..."
mkdir -p /opt/zorg
cd /opt/zorg

if [ ! -d "/opt/zorg/.git" ]; then
  git clone https://github.com/artofdream/zorg-dungeon.git .
else
  git pull origin main
fi

echo "==> Launching production stack..."
sudo docker compose -f deploy/compose.prod.yaml up -d --build

echo "==> Production stack launched successfully!"
echo "    App: https://zorg.artof.link"
echo "    Grafana: https://zorg.artof.link/grafana/"
