import serial
import pyqtgraph as pg
from pyqtgraph.Qt import QtWidgets, QtCore
import sys

# -------- Serial config --------
PORT = "COM5"  # change this
BAUD = 115200

# -------- Plot config --------
MAX_POINTS = 200
Y_MIN = 0
Y_MAX = 60

# Open serial port
ser = serial.Serial(PORT, BAUD, timeout=1)

# Qt Application
app = QtWidgets.QApplication(sys.argv)

# Create plot window
win = pg.GraphicsLayoutWidget(title="MPU-6050 Temperature")
plot = win.addPlot(title="Temperature (°C)")
plot.setLabel("left", "Temperature", units="°C")
plot.setLabel("bottom", "Samples")
plot.setYRange(Y_MIN, Y_MAX)
plot.showGrid(x=True, y=True)

curve = plot.plot(pen=pg.mkPen(width=2))

temps = []


# -------- Update function --------
def update():
    global temps

    try:
        line = ser.readline().decode("utf-8").strip()
        if line:
            temp = float(line)
            temps.append(temp)

            if len(temps) > MAX_POINTS:
                temps = temps[-MAX_POINTS:]

            curve.setData(temps)

    except ValueError:
        pass  # ignore malformed lines


# Timer for periodic updates
timer = QtCore.QTimer()
timer.timeout.connect(update)
timer.start(10)  # ms

# Show window and start app
win.show()
sys.exit(app.exec_())
