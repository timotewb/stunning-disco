#include "sensors/mpu6050.h"

#include "hardware/i2c.h"
#include "pico/time.h"

namespace sensors {
namespace mpu6050 {

namespace {
constexpr uint8_t PWR_MGMT_1 = 0x6B;
constexpr uint8_t ACCEL_XOUT_H = 0x3B;
}

void Init() {
    uint8_t payload[2] = {PWR_MGMT_1, 0x00};
    i2c_write_blocking(app::config::I2C_PORT, app::config::MPU6050_ADDR, payload, 2, false);
    sleep_ms(100);
}

bool Read(app::model::Mpu6050Data &data) {
    uint8_t reg = ACCEL_XOUT_H;
    uint8_t raw[14];

    if (i2c_write_blocking(app::config::I2C_PORT, app::config::MPU6050_ADDR, &reg, 1, true) != 1) {
        data.valid = false;
        return false;
    }

    if (i2c_read_blocking(app::config::I2C_PORT, app::config::MPU6050_ADDR, raw, 14, false) != 14) {
        data.valid = false;
        return false;
    }

    data.accel_x = (raw[0] << 8) | raw[1];
    data.accel_y = (raw[2] << 8) | raw[3];
    data.accel_z = (raw[4] << 8) | raw[5];

    const int16_t temp_raw = (raw[6] << 8) | raw[7];
    data.temperature_c = static_cast<float>(temp_raw) / 340.0f + 36.53f;

    data.gyro_x = (raw[8] << 8) | raw[9];
    data.gyro_y = (raw[10] << 8) | raw[11];
    data.gyro_z = (raw[12] << 8) | raw[13];

    data.valid = true;
    return true;
}

}  // namespace mpu6050
}  // namespace sensors
