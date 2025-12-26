import smbus
import time
from gpiozero import LED, Button
from signal import pause
from functools import partial

# user libraries
from helper import button_pressed, button_released


class Setup:
    def __init__(self):
        self.MPU_ADDR = 0x68
        self.LCD_ADDR = 0x27
        self.PWR_MGMT_1 = 0x6B
        self.TEMP_OUT_H = 0x41
        self.bus = smbus.SMBus(1)
        self.led = LED(27)
        self.button = Button(17, bounce_time=0.02)
        self.view: int = 0


def main():
    s = Setup()

    # Wake up MPU6050
    s.bus.write_byte_data(s.MPU_ADDR, s.PWR_MGMT_1, 0)

    s.button.when_pressed = partial(button_pressed, s)
    s.button.when_released = partial(button_released, s)

    try:
        pause()
    except KeyboardInterrupt:
        pass
    finally:
        try:
            s.button.close()
        except Exception:
            pass
        try:
            # smbus.SMBus has a close() method on many implementations
            s.bus.close()
        except Exception:
            pass


if __name__ == "__main__":
    main()
