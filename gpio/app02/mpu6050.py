def read_temperature(s) -> float | None:
    high = s.bus.read_byte_data(s.MPU_ADDR, s.TEMP_OUT_H)
    low = s.bus.read_byte_data(s.MPU_ADDR, s.TEMP_OUT_H + 1)
    raw: int = (high << 8) | low
    if raw > 32768:
        raw -= 65536
    temp_c: float = (raw / 340.0) + 36.53
    if temp_c:
        return temp_c
    else:
        return None
