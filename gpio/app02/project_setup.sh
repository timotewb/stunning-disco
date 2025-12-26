#!/usr/bin/env bash

set -e

echo "Installing dependencies"
sudo apt update
sudo apt install python-dev-is-python3 python3-dev -y
sudo apt install python3-setuptools -y
sudo apt install python3-smbus -y
echo "python tools installed successfully."
sudo apt-get install i2c-tools -y

echo "Testing i2c"
i2cdetect -y 1


VENV_DIR="venv"
if [ -d "$VENV_DIR" ]; then
    echo "Virtual environment '$VENV_DIR' already exists. Skipping creation."
else
    echo "Creating python virtual environment '$VENV_DIR'..."
    python -m venv "$VENV_DIR"
    echo "Virtual environment '$VENV_DIR' created successfully."
fi


REQUIREMENTS_FILE="requirements.txt"
echo "Creating $REQUIREMENTS_FILE..."
cat > "$REQUIREMENTS_FILE" <<EOF
lgpio==0.2.2.0
gpiozero==2.0.1
mpu6050-raspberrypi==1.2
smbus==1.1.post2
RPLCD==1.4.0
EOF
echo "$REQUIREMENTS_FILE created successfully."


echo "Installing Python packages into virtual environment"
"$VENV_DIR/bin/python" -m pip install --upgrade pip
"$VENV_DIR/bin/pip" install -r "$REQUIREMENTS_FILE"
echo "Python packages installed successfully."
