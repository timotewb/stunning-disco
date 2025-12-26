import time


# ---------- LCD FUNCTIONS ----------
def lcd_write_byte(s, data: bytes) -> None:
    s.bus.write_byte(s.LCD_ADDR, data)


def lcd_toggle_enable(s, data: bytes) -> None:
    lcd_write_byte(s, data | 0x04)
    time.sleep(0.0005)
    lcd_write_byte(s, data & ~0x04)
    time.sleep(0.0005)


def lcd_send(s, data: bytes, mode) -> None:
    high = mode | (data & 0xF0) | 0x08
    low = mode | ((data << 4) & 0xF0) | 0x08
    lcd_write_byte(s, high)
    lcd_toggle_enable(s, high)
    lcd_write_byte(s, low)
    lcd_toggle_enable(s, low)


def lcd_command(s, cmd) -> None:
    lcd_send(s, cmd, 0)


def lcd_char(s, char) -> None:
    lcd_send(s, ord(char), 1)


def lcd_init(s) -> None:
    time.sleep(0.05)
    lcd_command(s, 0x33)
    lcd_command(s, 0x32)
    lcd_command(s, 0x06)
    lcd_command(s, 0x0C)
    lcd_command(s, 0x28)
    lcd_command(s, 0x01)
    time.sleep(0.05)


def lcd_string(s, text, line) -> None:
    if line == 1:
        lcd_command(s, 0x80)
    elif line == 2:
        lcd_command(s, 0xC0)
    for char in text.ljust(16):
        lcd_char(s, char)
