import serial
import matplotlib.pyplot as plt
import time

# Change this to your COM port
PORT = "COM5"
BAUD = 115200

ser = serial.Serial(PORT, BAUD, timeout=1)

plt.ion()  # interactive mode
fig, ax = plt.subplots()
temps = []

(line,) = ax.plot([], [], lw=2)
ax.set_ylim(0, 60)
ax.set_xlabel("Samples")
ax.set_ylabel("Temperature (°C)")
ax.set_title("MPU-6050 Temperature")

while True:
    try:
        line_data = ser.readline().decode("utf-8").strip()
        if line_data:
            temp = float(line_data)
            temps.append(temp)

            # Keep last 100 samples
            temps = temps[-100:]

            line.set_ydata(temps)
            line.set_xdata(range(len(temps)))
            ax.set_xlim(0, len(temps))

            plt.pause(0.01)

    except KeyboardInterrupt:
        break
    except ValueError:
        pass  # ignore bad lines
