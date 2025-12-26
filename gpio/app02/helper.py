import socket
from lcd import lcd_init, lcd_string
from mpu6050 import read_temperature


def button_pressed(s) -> None:
    s.led.on()

    lcd_init(s)

    if s.view == 0:
        lcd_string(s, "MPU6050 Temp", 1)
        temp: float | None = read_temperature(s)
        lcd_string(s, f"{temp:.2f} C", 2)
    elif s.view == 1:
        lcd_string(s, "IP Address", 1)
        lcd_string(s, get_ip_address(), 2)

    # set next view
    if s.view == 1:
        s.view = 0
    else:
        s.view += 1


def button_released(s) -> None:
    s.led.off()


def get_ip_address() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip: str = s.getsockname()[0]
        s.close()
        return ip
    except Exception as e:
        print(e)
        return f"No Network."
