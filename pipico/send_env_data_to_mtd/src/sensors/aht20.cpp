#include "sensors/aht20.h"

#include <cmath>

#include "hardware/i2c.h"
#include "pico/time.h"

namespace sensors {
namespace aht20 {

bool Read(app::model::Aht20Data &data) {
    uint8_t cmd[3] = {0xAC, 0x33, 0x00};
    if (i2c_write_blocking(app::config::I2C_PORT, app::config::AHT20_ADDR, cmd, 3, false) != 3) {
        data.valid = false;
        return false;
    }

    sleep_ms(80);

    uint8_t raw[6];
    if (i2c_read_blocking(app::config::I2C_PORT, app::config::AHT20_ADDR, raw, 6, false) != 6) {
        data.valid = false;
        return false;
    }

    data.status = raw[0];

    const uint32_t humidity =
        (static_cast<uint32_t>(raw[1]) << 12) |
        (static_cast<uint32_t>(raw[2]) << 4) |
        (raw[3] >> 4);

    const uint32_t temperature =
        ((static_cast<uint32_t>(raw[3]) & 0x0F) << 16) |
        (static_cast<uint32_t>(raw[4]) << 8) |
        raw[5];

    data.humidity_pct = (static_cast<float>(humidity) * 100.0f) / 1048576.0f;
    data.temperature_c = (static_cast<float>(temperature) * 200.0f) / 1048576.0f - 50.0f;
    data.valid = true;
    return true;
}

}  // namespace aht20
}  // namespace sensors
