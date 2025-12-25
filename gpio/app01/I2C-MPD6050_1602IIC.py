import smbus
import time

# I2C setup
bus = smbus.SMBus(1)

MPU_ADDR = 0x68
LCD_ADDR = 0x27   # change to 0x3F if needed

# MPU6050 registers
PWR_MGMT_1 = 0x6B
TEMP_OUT_H = 0x41

# Wake up MPU6050
bus.write_byte_data(MPU_ADDR, PWR_MGMT_1, 0)

# ---------- LCD FUNCTIONS ----------
def lcd_write_byte(data):
    bus.write_byte(LCD_ADDR, data)

def lcd_toggle_enable(data):
    lcd_write_byte(data | 0x04)
    time.sleep(0.0005)
    lcd_write_byte(data & ~0x04)
    time.sleep(0.0005)

def lcd_send(data, mode):
    high = mode | (data & 0xF0) | 0x08
    low = mode | ((data << 4) & 0xF0) | 0x08
    lcd_write_byte(high)
    lcd_toggle_enable(high)
    lcd_write_byte(low)
    lcd_toggle_enable(low)

def lcd_command(cmd):
    lcd_send(cmd, 0)

def lcd_char(char):
    lcd_send(ord(char), 1)

def lcd_init():
    time.sleep(0.05)
    lcd_command(0x33)
    lcd_command(0x32)
    lcd_command(0x06)
    lcd_command(0x0C)
    lcd_command(0x28)
    lcd_command(0x01)
    time.sleep(0.05)

def lcd_string(text, line):
    if line == 1:
        lcd_command(0x80)
    elif line == 2:
        lcd_command(0xC0)

    for char in text.ljust(16):
        lcd_char(char)

# ---------- MPU6050 TEMP ----------
def read_temperature():
    high = bus.read_byte_data(MPU_ADDR, TEMP_OUT_H)
    low = bus.read_byte_data(MPU_ADDR, TEMP_OUT_H + 1)
    raw = (high << 8) | low
    if raw > 32768:
        raw -= 65536
    temp_c = (raw / 340.0) + 36.53
    return temp_c

# ---------- MAIN ----------
lcd_init()
lcd_string("MPU6050 Temp", 1)

while True:
    temp = read_temperature()
    lcd_string(f"{temp:.2f} C", 2)
    time.sleep(1)