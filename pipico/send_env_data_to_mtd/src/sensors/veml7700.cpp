#include "sensors/veml7700.h"

#include "hardware/i2c.h"
#include "pico/time.h"

namespace sensors {
namespace veml7700 {

namespace {
constexpr uint8_t ALS_CONF = 0x00;
constexpr uint8_t ALS_DATA = 0x04;
}

void Init() {
    uint8_t payload[3];
    payload[0] = ALS_CONF;
    payload[1] = 0x00;
    payload[2] = 0x00;
    i2c_write_blocking(app::config::I2C_PORT, app::config::VEML7700_ADDR, payload, 3, false);
    sleep_ms(100);
}

bool Read(app::model::Veml7700Data &data) {
    uint8_t reg = ALS_DATA;
    uint8_t raw[2];

    if (i2c_write_blocking(app::config::I2C_PORT, app::config::VEML7700_ADDR, &reg, 1, true) != 1) {
        data.valid = false;
        return false;
    }

    if (i2c_read_blocking(app::config::I2C_PORT, app::config::VEML7700_ADDR, raw, 2, false) != 2) {
        data.valid = false;
        return false;
    }

    const uint16_t raw_value = (raw[1] << 8) | raw[0];
    data.lux = static_cast<float>(raw_value) * 0.0576f;
    data.valid = true;
    return true;
}

}  // namespace veml7700
}  // namespace sensors
