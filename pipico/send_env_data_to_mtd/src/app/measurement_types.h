#pragma once

#include <cstdint>
#include <cstddef>

namespace app {
namespace model {

struct Aht20Data {
    bool valid = false;
    float temperature_c = 0.0f;
    float humidity_pct = 0.0f;
    uint8_t status = 0;
};

struct Bmp280Data {
    bool valid = false;
    float temperature_c = 0.0f;
    float pressure_pa = 0.0f;
    float altitude_m = 0.0f;
};

struct Mpu6050Data {
    bool valid = false;
    int16_t accel_x = 0;
    int16_t accel_y = 0;
    int16_t accel_z = 0;
    int16_t gyro_x = 0;
    int16_t gyro_y = 0;
    int16_t gyro_z = 0;
    float temperature_c = 0.0f;
};

struct Veml7700Data {
    bool valid = false;
    float lux = 0.0f;
};

struct HscdtdData {
    bool valid = false;
    int16_t x = 0;
    int16_t y = 0;
    int16_t z = 0;
    float heading_deg = 0.0f;
};

struct GpsData {
    bool fix = false;
    float latitude = 0.0f;
    float longitude = 0.0f;
    bool datetime_valid = false;
    char datetime[20] = {0};
};

struct SensorSnapshot {
    Aht20Data aht20;
    Bmp280Data bmp280;
    Mpu6050Data mpu6050;
    Veml7700Data veml7700;
    HscdtdData hscdtd;
    GpsData gps;
};

}  // namespace model
}  // namespace app
