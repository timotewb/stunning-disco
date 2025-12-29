import sys
import time
import serial
import pyqtgraph as pg
from pyqtgraph.Qt import QtWidgets, QtCore

# ---------------- Configuration ----------------
PORT = "COM5"  # CHANGE THIS
BAUD = 115200
UPDATE_MS = 20
MAX_POINTS = 400

ACCEL_SCALE = 16384.0
GYRO_SCALE = 131.0

# ---------------- Qt App FIRST ----------------
app = QtWidgets.QApplication(sys.argv)
pg.setConfigOptions(antialias=True)

win = pg.GraphicsLayoutWidget(title="MPU-6050 Live Data")
win.resize(1200, 900)

# ---------------- Serial ----------------
ser = serial.Serial(PORT, BAUD, timeout=1)

# ---------------- Plots ----------------
plots = {}


def add_plot(title, y_label, y_range):
    p = win.addPlot(title=title)
    p.setLabel("left", y_label)
    p.showGrid(x=True, y=True)
    p.setYRange(*y_range)
    return p


# Row 1 — Accel
plots["ax"] = add_plot("Accel X", "g", (-2, 2))
plots["ay"] = add_plot("Accel Y", "g", (-2, 2))
plots["az"] = add_plot("Accel Z", "g", (-2, 2))
win.nextRow()

# Row 2 — Gyro rate
plots["gx"] = add_plot("Gyro X", "°/s", (-250, 250))
plots["gy"] = add_plot("Gyro Y", "°/s", (-250, 250))
plots["gz"] = add_plot("Gyro Z", "°/s", (-250, 250))
win.nextRow()

# Row 3 — Gyro angle
plots["ang_x"] = add_plot("Angle X", "°", (-180, 180))
plots["ang_y"] = add_plot("Angle Y", "°", (-180, 180))
plots["ang_z"] = add_plot("Angle Z", "°", (-180, 180))
win.nextRow()

# Row 4 — Temperature
plots["temp"] = add_plot("Temperature", "°C", (20, 50))

# ---------------- Curves ----------------
colors = {
    "ax": "r",
    "ay": "g",
    "az": "b",
    "gx": "r",
    "gy": "g",
    "gz": "b",
    "ang_x": "r",
    "ang_y": "g",
    "ang_z": "b",
    "temp": "y",
}

curves = {}
data = {}

for key, plot in plots.items():
    curves[key] = plot.plot(pen=pg.mkPen(colors[key], width=2))
    data[key] = []

# ---------------- State ----------------
angles = {"x": 0.0, "y": 0.0, "z": 0.0}
last_time = None


# ---------------- Update Loop ----------------
def update():
    global last_time

    try:
        while ser.in_waiting:
            line = ser.readline().decode("utf-8").strip()
            if not line or line.startswith("ax"):
                continue

        values = line.split(",")
        if len(values) != 7:
            return

        ax_raw, ay_raw, az_raw, temp, gx_raw, gy_raw, gz_raw = map(float, values)

        ax = ax_raw / ACCEL_SCALE
        ay = ay_raw / ACCEL_SCALE
        az = az_raw / ACCEL_SCALE

        gx = gx_raw / GYRO_SCALE
        gy = gy_raw / GYRO_SCALE
        gz = gz_raw / GYRO_SCALE

        now = time.time()
        if last_time is None:
            last_time = now
            return

        dt = now - last_time
        last_time = now

        angles["x"] += gx * dt
        angles["y"] += gy * dt
        angles["z"] += gz * dt

        samples = {
            "ax": ax,
            "ay": ay,
            "az": az,
            "gx": gx,
            "gy": gy,
            "gz": gz,
            "ang_x": angles["x"],
            "ang_y": angles["y"],
            "ang_z": angles["z"],
            "temp": temp,
        }

        for key, value in samples.items():
            data[key].append(value)
            if len(data[key]) > MAX_POINTS:
                data[key] = data[key][-MAX_POINTS:]
            curves[key].setData(data[key])

    except Exception:
        pass


# ---------------- Timer ----------------
timer = QtCore.QTimer()
timer.timeout.connect(update)
timer.start(UPDATE_MS)

# ---------------- Run ----------------
win.show()
sys.exit(app.exec())  # ✅ IMPORTANT FIX
