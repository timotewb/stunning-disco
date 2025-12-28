#include <stdio.h>
#include "pico/stdlib.h"
#include "hardware/i2c.h"

// I2C defines
// This example will use I2C0 on GPIO8 (SDA) and GPIO9 (SCL) running at 400KHz.
// Pins can be changed, see the GPIO function select table in the datasheet for information on GPIO assignments
#define I2C_PORT i2c0
#define SDA_PIN 16
#define SCL_PIN 17

#define MPU6050_ADDR 0x68
#define PWR_MGMT_1 0x6B
#define TEMP_OUT_H 0x41



int main()
{
    stdio_init_all();

    // I2C Initialisation. Using it at 400Khz.
    i2c_init(I2C_PORT, 400*1000);
    
    gpio_set_function(SDA_PIN, GPIO_FUNC_I2C);
    gpio_set_function(SCL_PIN, GPIO_FUNC_I2C);
    gpio_pull_up(SDA_PIN);
    gpio_pull_up(SCL_PIN);
    
    // wait fro serial monitor
    sleep_ms(2000);

    // wake up mpu-6050
    uint8_t buf[2];
    buf[0] = PWR_MGMT_1;
    buf[1] = 0x00; // set to zero (wakes up the MPU-6050)
    i2c_write_blocking(I2C_PORT, MPU6050_ADDR, buf, 2, false);

    printf("MPU6050 initialized and awake.\n");

    while (true) {
        uint8_t temp_reg = TEMP_OUT_H;
        uint8_t temp_data[2];

        // request temperature data
        i2c_write_blocking(I2C_PORT, MPU6050_ADDR, &temp_reg, 1, true);
        i2c_read_blocking(I2C_PORT, MPU6050_ADDR, temp_data, 2, false);

        // combine high and low bytes
        int16_t raw_temp = (temp_data[0] << 8) | temp_data[1];

        // convert to Celsius
        float temperature = (raw_temp / 340.0) + 36.53;

        // output for debugging
        // printf("Temperature: %.2f C\n", temperature);

        // output for plotting
        printf("%.2f\n", temperature);


        sleep_ms(500);
    }
}
