import sys
import time
import serial
from collections import deque

import pyqtgraph as pg
from PyQt5.QtWidgets import QApplication
from PyQt5.QtCore import QTimer


def main():
    # =======================
    # Configuration
    # =======================

    SERIAL_PORT = "COM8"  # CHANGE THIS
    BAUD_RATE = 115200

    UPDATE_MS = 20
    MAX_POINTS = 500

    PLOTS = [
        ("ahtT", "AHT20 – Temperature", "°C", "r", 50),
        ("ahtH", "AHT20 – Humidity", "%RH", "b", 100),
        ("bmpT", "BMP280 – Temperature", "°C", "g", 50),
        ("bmpP", "BMP280 – Pressure", "Pa", "y", 105000),
        ("alt", "BMP280 – Altitude", "m", "m", 2000),
    ]

    Y_PADDING = {
        "ahtT": 1.1,
        "ahtH": 1.05,
        "bmpT": 1.1,
        "bmpP": 1.01,
        "alt": 1.2,
    }

    # =======================
    # Serial
    # =======================

    try:
        ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=0)
        print(f"Connected to {SERIAL_PORT}")
    except Exception as e:
        print(f"ERROR opening serial port: {e}")
        sys.exit(1)

    # =======================
    # Qt setup
    # =======================

    app = QApplication(sys.argv)
    win = pg.GraphicsLayoutWidget(title="Environmental Sensor Monitor")
    win.resize(1200, 900)
    win.show()

    pg.setConfigOptions(antialias=True)

    plots = {}
    curves = {}
    data = {}

    start_time = time.time()
    time_data = deque(maxlen=MAX_POINTS)

    # =======================
    # Plot creation
    # =======================

    def add_plot(row, key, title, y_label, color, y_max):
        p = win.addPlot(row=row, col=0, title=title)
        p.setLabel("left", y_label)
        p.setLabel("bottom", "Time", "s")
        p.showGrid(x=True, y=True)

        p.setYRange(0, y_max)
        p.enableAutoRange(axis="y", enable=False)

        curve = p.plot(pen=pg.mkPen(color, width=2))
        return p, curve

    for row, (key, title, ylab, color, ymax) in enumerate(PLOTS):
        plots[key], curves[key] = add_plot(row, key, title, ylab, color, ymax)
        data[key] = deque(maxlen=MAX_POINTS)

    # Link X axes
    first_plot = plots[PLOTS[0][0]]
    for p in plots.values():
        p.setXLink(first_plot)

    # Hide x-axis labels except bottom plot
    for key, p in plots.items():
        if key != PLOTS[-1][0]:
            p.hideAxis("bottom")

    # =======================
    # Helpers
    # =======================

    def update_y_range(plot, values, key):
        if not values:
            return
        ymax = max(values) * Y_PADDING[key]
        plot.setYRange(0, max(ymax, 1e-6), padding=0)

    # =======================
    # Update loop
    # =======================

    def update():
        while ser.in_waiting:
            line = ser.readline().decode("utf-8", errors="ignore").strip()
            if not line:
                return

            try:
                parts = dict(kv.split("=") for kv in line.split(","))
            except ValueError:
                return

            t = time.time() - start_time
            time_data.append(t)

            for key in data:
                if key in parts:
                    data[key].append(float(parts[key]))

        for key in curves:
            if len(data[key]) > 1:
                curves[key].setData(time_data, data[key])
                update_y_range(plots[key], data[key], key)

        if len(time_data) > 1:
            # only update first plot; others are linked
            plots[PLOTS[0][0]].setXRange(time_data[0], time_data[-1], padding=0)

    # =======================
    # Timer
    # =======================

    timer = QTimer()
    timer.timeout.connect(update)
    timer.start(UPDATE_MS)

    # =======================
    # Run
    # =======================

    sys.exit(app.exec_())


# =======================
# REQUIRED ON WINDOWS
# =======================

if __name__ == "__main__":
    main()
