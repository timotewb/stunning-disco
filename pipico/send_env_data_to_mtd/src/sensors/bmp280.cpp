#include "sensors/bmp280.h"

#include <cmath>

#include "hardware/i2c.h"
#include "pico/stdlib.h"

namespace sensors {
namespace bmp280 {

namespace {
struct Calibration {
    uint16_t dig_T1 = 0;
    int16_t dig_T2 = 0;
    int16_t dig_T3 = 0;
    uint16_t dig_P1 = 0;
    int16_t dig_P2 = 0;
    int16_t dig_P3 = 0;
    int16_t dig_P4 = 0;
    int16_t dig_P5 = 0;
    int16_t dig_P6 = 0;
    int16_t dig_P7 = 0;
    int16_t dig_P8 = 0;
    int16_t dig_P9 = 0;
};

Calibration calibration;
int32_t t_fine = 0;
bool calibration_loaded = false;

void LoadCalibration() {
    uint8_t reg = 0x88;
    uint8_t raw[24];

    if (i2c_write_blocking(app::config::I2C_PORT, app::config::BMP280_ADDR, &reg, 1, true) != 1) {
        calibration_loaded = false;
        return;
    }

    if (i2c_read_blocking(app::config::I2C_PORT, app::config::BMP280_ADDR, raw, 24, false) != 24) {
        calibration_loaded = false;
        return;
    }

    calibration.dig_T1 = (raw[1] << 8) | raw[0];
    calibration.dig_T2 = (raw[3] << 8) | raw[2];
    calibration.dig_T3 = (raw[5] << 8) | raw[4];

    calibration.dig_P1 = (raw[7] << 8) | raw[6];
    calibration.dig_P2 = (raw[9] << 8) | raw[8];
    calibration.dig_P3 = (raw[11] << 8) | raw[10];
    calibration.dig_P4 = (raw[13] << 8) | raw[12];
    calibration.dig_P5 = (raw[15] << 8) | raw[14];
    calibration.dig_P6 = (raw[17] << 8) | raw[16];
    calibration.dig_P7 = (raw[19] << 8) | raw[18];
    calibration.dig_P8 = (raw[21] << 8) | raw[20];
    calibration.dig_P9 = (raw[23] << 8) | raw[22];
    calibration_loaded = true;
}

bool ReadRaw(int32_t &adc_t, int32_t &adc_p) {
    uint8_t reg = 0xF7;
    uint8_t raw[6];

    if (i2c_write_blocking(app::config::I2C_PORT, app::config::BMP280_ADDR, &reg, 1, true) != 1) {
        return false;
    }

    if (i2c_read_blocking(app::config::I2C_PORT, app::config::BMP280_ADDR, raw, 6, false) != 6) {
        return false;
    }

    adc_p = (raw[0] << 12) | (raw[1] << 4) | (raw[2] >> 4);
    adc_t = (raw[3] << 12) | (raw[4] << 4) | (raw[5] >> 4);
    return true;
}

float CompensateTemperature(int32_t adc_T) {
    int32_t var1 = ((((adc_T >> 3) - (static_cast<int32_t>(calibration.dig_T1) << 1))) *
                   static_cast<int32_t>(calibration.dig_T2)) >> 11;
    int32_t var2 = (((((adc_T >> 4) - static_cast<int32_t>(calibration.dig_T1)) *
                     ((adc_T >> 4) - static_cast<int32_t>(calibration.dig_T1))) >> 12) *
                    static_cast<int32_t>(calibration.dig_T3)) >> 14;

    t_fine = var1 + var2;
    return static_cast<float>((t_fine * 5 + 128) >> 8) / 100.0f;
}

float CompensatePressure(int32_t adc_P) {
    int64_t var1 = static_cast<int64_t>(t_fine) - 128000;
    int64_t var2 = var1 * var1 * static_cast<int64_t>(calibration.dig_P6);
    var2 += (var1 * static_cast<int64_t>(calibration.dig_P5)) << 17;
    var2 += static_cast<int64_t>(calibration.dig_P4) << 35;
    var1 = ((var1 * var1 * static_cast<int64_t>(calibration.dig_P3)) >> 8) +
           ((var1 * static_cast<int64_t>(calibration.dig_P2)) << 12);
    var1 = (((static_cast<int64_t>(1) << 47) + var1)) * static_cast<int64_t>(calibration.dig_P1) >> 33;

    if (var1 == 0) {
        return 0.0f;
    }

    int64_t p = 1048576 - adc_P;
    p = (((p << 31) - var2) * 3125) / var1;
    var1 = (static_cast<int64_t>(calibration.dig_P9) * (p >> 13) * (p >> 13)) >> 25;
    var2 = (static_cast<int64_t>(calibration.dig_P8) * p) >> 19;
    p = ((p + var1 + var2) >> 8) + (static_cast<int64_t>(calibration.dig_P7) << 4);

    return static_cast<float>(p) / 256.0f;
}

float CalculateAltitude(float pressure_pa) {
    if (pressure_pa <= 0.0f) {
        return 0.0f;
    }
    return 44330.0f * (1.0f - std::pow(pressure_pa / 101325.0f, 0.1903f));
}

}  // namespace

void Init() {
    LoadCalibration();
    uint8_t ctrl_meas[2] = {0xF4, 0x27};
    uint8_t config[2] = {0xF5, 0xA0};

    i2c_write_blocking(app::config::I2C_PORT, app::config::BMP280_ADDR, ctrl_meas, 2, false);
    i2c_write_blocking(app::config::I2C_PORT, app::config::BMP280_ADDR, config, 2, false);
}

bool Read(app::model::Bmp280Data &data) {
    if (!calibration_loaded) {
        LoadCalibration();
        if (!calibration_loaded) {
            data.valid = false;
            return false;
        }
    }

    int32_t adc_t = 0;
    int32_t adc_p = 0;
    if (!ReadRaw(adc_t, adc_p)) {
        data.valid = false;
        return false;
    }

    data.temperature_c = CompensateTemperature(adc_t);
    data.pressure_pa = CompensatePressure(adc_p);
    data.altitude_m = CalculateAltitude(data.pressure_pa);
    data.valid = true;
    return true;
}

}  // namespace bmp280
}  // namespace sensors
