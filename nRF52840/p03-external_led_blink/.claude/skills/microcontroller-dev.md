---
name: microcontroller-dev
description: End-to-end development for microcontrollers (e.g., nRF52840) including device discovery, build, upload, and monitoring.
category: hardware
platforms: [windows]
---

# Microcontroller Development Skill

This skill enables an agent to be self-sufficient in developing software for microcontrollers. It focuses on using PlatformIO Core (CLI) and PySerial for a headless development workflow.

**Note:** Currently optimized for **Windows**. Commands for other operating systems may require modification of paths and tool names.

## Workflow

### 1. Device Discovery
Before starting, identify the connected hardware.
- Use `python -c "import serial.tools.list_ports; [print(p) for p in serial.tools.list_ports.comports()]"` to list available COM ports.
- Map the output to the expected board (e.g., nRF52840).

### 2. Environment Setup
Ensure the necessary CLI tools are installed.
- **PySerial**: `python -m pip install pyserial`
- **PlatformIO Core**: `python -m pip install --user platformio`
- **PIO Path**: On Windows, the binary is typically at `C:\Users\<USER>\AppData\Roaming\Python\Python311\Scripts\pio`. Always verify the path or use the full path in commands.

### 3. Development Cycle

#### Build
Navigate to the project directory (containing `platformio.ini`) and run:
` <pio-path> run`

#### Upload
Flash the firmware to the device:
` <pio-path> run --target upload`
*Note: PlatformIO usually auto-detects the port, but you can specify it if needed.*

#### Monitoring
Because `pio device monitor` often requires an interactive TTY (which AI agents lack), use a Python snippet to capture output:
`python -c "import serial; s = serial.Serial('<PORT>', 115200, timeout=2); print(s.read(1000).decode('utf-8', errors='ignore')); s.close()"`
*Adjust the baud rate (e.g., 115200, 9600) and read size as needed.*

## Troubleshooting
- **Permission Denied**: If pip fails, use the `--user` flag.
- **Port Locked**: Ensure no other serial monitors (like VS Code's monitor) are open when attempting to upload or read.
- **Path Issues**: If `pio` is not in the system PATH, use the absolute path to the executable.
