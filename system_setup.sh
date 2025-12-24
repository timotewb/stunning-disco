#!/usr/bin/env bash

set -e

sudo apt update
sudo apt upgrade -y
sudo apt autoremove -y

echo "System will reboot in 5 seconds."
sleep 5
echo "Rebooting."
sudo reboot
