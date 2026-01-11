#include "telemetry/telemetry.h"

#include <cmath>
#include <cstdio>

#include "app/app_config.h"
#include "hardware/gpio.h"
#include "hardware/uart.h"
#include "pico/stdlib.h"

namespace telemetry {

namespace {
constexpr std::size_t kBufferSize = 320;

float ValueOrNan(bool valid, float value) {
    return valid ? value : std::nanf("");
}

int BoolToInt(bool flag) {
    return flag ? 1 : 0;
}

}  // namespace

void Init() {
    uart_init(app::config::MESH_UART, app::config::BAUD_RATE);
    gpio_set_function(app::config::UART_TX_PIN, GPIO_FUNC_UART);
    gpio_set_function(app::config::UART_RX_PIN, GPIO_FUNC_UART);
    uart_set_fifo_enabled(app::config::MESH_UART, true);
}

void Publish(const app::model::SensorSnapshot &snapshot) {
    char buffer[kBufferSize];

    const float altitude = snapshot.bmp280.valid ? snapshot.bmp280.altitude_m : std::nanf("");

    int length = std::snprintf(buffer, sizeof(buffer),
                               "ahtT=%.2f,ahtH=%.2f,ahtStatus=0x%02X,"
                               "bmpT=%.2f,bmpP=%.2f,alt=%.2f,"
                               "mpuOk=%d,ax=%d,ay=%d,az=%d,gx=%d,gy=%d,gz=%d,mpuT=%.2f,"
                               "luxOk=%d,lux=%.2f,"
                               "magOk=%d,magX=%d,magY=%d,magZ=%d,head=%.1f,"
                               "gpsfix=%d",
                               snapshot.aht20.temperature_c,
                               snapshot.aht20.humidity_pct,
                               snapshot.aht20.status,
                               ValueOrNan(snapshot.bmp280.valid, snapshot.bmp280.temperature_c),
                               ValueOrNan(snapshot.bmp280.valid, snapshot.bmp280.pressure_pa),
                               altitude,
                               BoolToInt(snapshot.mpu6050.valid),
                               snapshot.mpu6050.accel_x,
                               snapshot.mpu6050.accel_y,
                               snapshot.mpu6050.accel_z,
                               snapshot.mpu6050.gyro_x,
                               snapshot.mpu6050.gyro_y,
                               snapshot.mpu6050.gyro_z,
                               ValueOrNan(snapshot.mpu6050.valid, snapshot.mpu6050.temperature_c),
                               BoolToInt(snapshot.veml7700.valid),
                               ValueOrNan(snapshot.veml7700.valid, snapshot.veml7700.lux),
                               BoolToInt(snapshot.hscdtd.valid),
                               snapshot.hscdtd.x,
                               snapshot.hscdtd.y,
                               snapshot.hscdtd.z,
                               ValueOrNan(snapshot.hscdtd.valid, snapshot.hscdtd.heading_deg),
                               BoolToInt(snapshot.gps.fix));

    if (length < 0 || static_cast<std::size_t>(length) >= sizeof(buffer)) {
        return;
    }

    if (snapshot.gps.fix) {
        const int appended = std::snprintf(buffer + length, sizeof(buffer) - static_cast<std::size_t>(length),
                                           ",lat=%.6f,lon=%.6f\n",
                                           snapshot.gps.latitude,
                                           snapshot.gps.longitude);
        if (appended > 0) {
            length += appended;
        }
    } else {
        std::snprintf(buffer + length, sizeof(buffer) - static_cast<std::size_t>(length), "\n");
    }

    printf("%s", buffer);
    uart_puts(app::config::MESH_UART, buffer);
    stdio_flush();
}

}  // namespace telemetry
