#include <stdio.h>
#include "pico/stdlib.h"
#include "hardware/i2c.h"

#define I2C_PORT i2c0
#define SDA_PIN 16
#define SCL_PIN 17

#define MPU6050_ADDR 0x68

#define PWR_MGMT_1 0x6B
#define ACCEL_XOUT_H 0x3B

int main()
{
    stdio_init_all();

    // init I2C
    i2c_init(I2C_PORT, 400 * 1000);
    gpio_set_function(SDA_PIN, GPIO_FUNC_I2C);
    gpio_set_function(SCL_PIN, GPIO_FUNC_I2C);
    gpio_pull_up(SDA_PIN);
    gpio_pull_up(SCL_PIN);

    sleep_ms(2000);

    // Wake up MPU6050
    uint8_t init_buf[2] = {PWR_MGMT_1, 0x00};
    i2c_write_blocking(I2C_PORT, MPU6050_ADDR, init_buf, 2, false);

    printf("ax,ay,az,temp,gx,gy,gz\n");

    while (true) {
        uint8_t reg = ACCEL_XOUT_H;
        uint8_t data[14];

        //request sensor data
        i2c_write_blocking(I2C_PORT, MPU6050_ADDR, &reg, 1, true);
        i2c_read_blocking(I2C_PORT, MPU6050_ADDR, data, 14, false);

        //combine bytes
        int16_t ax = (data[0] << 8) | data[1];
        int16_t ay = (data[2] << 8) | data[3];
        int16_t az = (data[4] << 8) | data[5];

        int16_t temp_raw = (data[6] << 8) | data[7];

        int16_t gx = (data[8] << 8) | data[9];
        int16_t gy = (data[10] << 8) | data[11];
        int16_t gz = (data[12] << 8) | data[13];

        // convert temp to Celsius
        float temp_c = (temp_raw / 340.0f) + 36.53f;

        // stream csv
        printf("%d,%d,%d,%.2f,%d,%d,%d\n", ax, ay, az, temp_c, gx, gy, gz);
        stdio_flush();

        // ~50hz
        sleep_ms(20);
    }
}
