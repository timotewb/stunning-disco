#include "sensors/hscdtd.h"

#include <cmath>

#include "hardware/i2c.h"

namespace sensors {
namespace hscdtd {

namespace {
constexpr uint8_t MODE_REGISTER = 0x0B;
constexpr uint8_t MODE_CONTINUOUS = 0x01;
constexpr float PI = 3.14159265358979323846f;
}

void Init() {
    uint8_t payload[2] = {MODE_REGISTER, MODE_CONTINUOUS};
    i2c_write_blocking(app::config::I2C_PORT, app::config::HSCDTD_ADDR, payload, 2, false);
}

bool Read(app::model::HscdtdData &data) {
    uint8_t reg = 0x00;
    uint8_t raw[6];

    if (i2c_write_blocking(app::config::I2C_PORT, app::config::HSCDTD_ADDR, &reg, 1, true) != 1) {
        data.valid = false;
        return false;
    }

    if (i2c_read_blocking(app::config::I2C_PORT, app::config::HSCDTD_ADDR, raw, 6, false) != 6) {
        data.valid = false;
        return false;
    }

    data.x = (raw[0] << 8) | raw[1];
    data.y = (raw[2] << 8) | raw[3];
    data.z = (raw[4] << 8) | raw[5];

    const float heading = std::atan2(static_cast<float>(data.y), static_cast<float>(data.x));
    float heading_deg = heading * 180.0f / PI;
    if (heading_deg < 0.0f) {
        heading_deg += 360.0f;
    }

    data.heading_deg = heading_deg;
    data.valid = true;
    return true;
}

}  // namespace hscdtd
}  // namespace sensors
