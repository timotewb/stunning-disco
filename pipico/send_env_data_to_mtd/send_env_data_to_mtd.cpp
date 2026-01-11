#include <cstdio>
#include "app/app_config.h"
#include "app/measurement_types.h"
#include "display/display.h"
#include "gps/gps.h"
#include "hardware/gpio.h"
#include "hardware/i2c.h"
#include "pico/stdlib.h"
#include "sensors/aht20.h"
#include "sensors/bmp280.h"
#include "sensors/hscdtd.h"
#include "sensors/mpu6050.h"
#include "sensors/veml7700.h"
#include "telemetry/telemetry.h"

int main() {
    stdio_init_all();

    gpio_init(app::config::LED_PIN);
    gpio_set_dir(app::config::LED_PIN, GPIO_OUT);

    i2c_init(app::config::I2C_PORT, app::config::I2C_FREQUENCY_HZ);
    gpio_set_function(app::config::SDA_PIN, GPIO_FUNC_I2C);
    gpio_set_function(app::config::SCL_PIN, GPIO_FUNC_I2C);
    gpio_pull_up(app::config::SDA_PIN);
    gpio_pull_up(app::config::SCL_PIN);

    telemetry::Init();
    gps::Init();
    sensors::mpu6050::Init();
    sensors::veml7700::Init();
    sensors::hscdtd::Init();
    sensors::bmp280::Init();
    display::Init();

    gpio_put(app::config::LED_PIN, 1);
    sleep_ms(500);
    gpio_put(app::config::LED_PIN, 0);
    sleep_ms(2000);

    printf("AHT20 + BMP280 + MPU6050 + VEML7700 + HSCDTD008A ready\n");

    app::model::SensorSnapshot snapshot;

    while (true) {
        snapshot = app::model::SensorSnapshot{};  // reset fields

        gps::Poll(snapshot.gps);

        if (!sensors::aht20::Read(snapshot.aht20)) {
            printf("AHT20 read error\n");
            sleep_ms(20000);
            continue;
        }

        gpio_put(app::config::LED_PIN, 1);

        sensors::bmp280::Read(snapshot.bmp280);
        sensors::mpu6050::Read(snapshot.mpu6050);
        sensors::veml7700::Read(snapshot.veml7700);
        sensors::hscdtd::Read(snapshot.hscdtd);

        display::Render(snapshot);
        telemetry::Publish(snapshot);

        sleep_ms(50);
        gpio_put(app::config::LED_PIN, 0);
        sleep_ms(20000);
    }
}
