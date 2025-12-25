import smbus
import time
import socket

bus = smbus.SMBus(1)

MPU_ADDR = 0x68
LCD_ADDR = 0x27

PWR_MGMT_1 = 0x6B
TEMP_OUT_H = 0x41

# Wake MPU6050
bus.write_byte_data(MPU_ADDR, PWR_MGMT_1, 0)

# ---------- LCD FUNCTIONS ----------
def lcd_write(data):
    bus.write_byte(LCD_ADDR, data)

def lcd_toggle(data):
    lcd_write(data | 0x04)
    time.sleep(0.0005)
    lcd_write(data & ~0x04)
    time.sleep(0.0005)

def lcd_send(data, mode):
    high = mode | (data & 0xF0) | 0x08
    low = mode | ((data << 4) & 0xF0) | 0x08
    lcd_write(high)
    lcd_toggle(high)
    lcd_write(low)
    lcd_toggle(low)

def lcd_cmd(cmd):
    lcd_send(cmd, 0)

def lcd_char(c):
    lcd_send(ord(c), 1)

def lcd_init():
    time.sleep(0.05)
    lcd_cmd(0x33)
    lcd_cmd(0x32)
    lcd_cmd(0x28)
    lcd_cmd(0x0C)
    lcd_cmd(0x06)
    lcd_cmd(0x01)
    time.sleep(0.05)

def lcd_string(text, line):
    lcd_cmd(0x80 if line == 1 else 0xC0)
    for c in text.ljust(16):
        lcd_char(c)

# ---------- MPU6050 ----------
def read_temperature():
    high = bus.read_byte_data(MPU_ADDR, TEMP_OUT_H)
    low = bus.read_byte_data(MPU_ADDR, TEMP_OUT_H + 1)
    raw = (high << 8) | low
    if raw > 32768:
        raw -= 65536
    return (raw / 340.0) + 36.53

# ---------- IP ADDRESS ----------
def get_ip_address():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "No Network"

# ---------- MAIN ----------
lcd_init()

views = 2
current_view = 0

while True:
    if current_view == 0:
        temp = read_temperature()
        lcd_string("Temperature", 1)
        lcd_string(f"{temp:.2f} C", 2)

    elif current_view == 1:
        ip = get_ip_address()
        lcd_string("IP Address", 1)
        lcd_string(ip, 2)

    current_view = (current_view + 1) % views
    time.sleep(3)