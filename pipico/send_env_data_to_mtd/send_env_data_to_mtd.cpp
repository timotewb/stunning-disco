#include <stdio.h>
#include "pico/stdlib.h"
#include "hardware/i2c.h"
#include "hardware/uart.h"

/* ---------- CONFIG ---------- */
#define I2C_PORT i2c0
#define SDA_PIN 4
#define SCL_PIN 5

#define AHT20_ADDR  0x38
#define BMP280_ADDR 0x76   // try 0x77 if needed

const uint LED_PIN = 15;

/* ---------- AHT20 ---------- */
bool read_aht20(float *temp_c, float *humidity) {
    uint8_t cmd[3] = {0xAC, 0x33, 0x00};
    i2c_write_blocking(I2C_PORT, AHT20_ADDR, cmd, 3, false);
    sleep_ms(80);

    uint8_t data[6];
    if (i2c_read_blocking(I2C_PORT, AHT20_ADDR, data, 6, false) != 6)
        return false;

    uint32_t raw_hum =
        ((uint32_t)(data[1]) << 12) |
        ((uint32_t)(data[2]) << 4)  |
        (data[3] >> 4);

    uint32_t raw_temp =
        ((uint32_t)(data[3] & 0x0F) << 16) |
        ((uint32_t)(data[4]) << 8) |
        data[5];

    *humidity = (raw_hum * 100.0f) / 1048576.0f;
    *temp_c   = (raw_temp * 200.0f) / 1048576.0f - 50.0f;

    return true;
}

/* ---------- BMP280 (minimal, temp + pressure) ---------- */
bool read_bmp280(float *temp_c, int32_t *pressure_pa) {
    uint8_t reg = 0xF7;
    uint8_t data[6];

    i2c_write_blocking(I2C_PORT, BMP280_ADDR, &reg, 1, true);
    if (i2c_read_blocking(I2C_PORT, BMP280_ADDR, data, 6, false) != 6)
        return false;

    int32_t adc_p = (data[0] << 12) | (data[1] << 4) | (data[2] >> 4);
    int32_t adc_t = (data[3] << 12) | (data[4] << 4) | (data[5] >> 4);

    /* NOTE:
       Proper BMP280 compensation requires calibration data.
       This simple example only verifies communication.
    */

    *temp_c = adc_t / 100.0f;        // placeholder
    *pressure_pa = adc_p;            // placeholder

    return true;
}

/* ---------- MAIN ---------- */
int main() {
    stdio_init_all();

    // Initialize the LED pin as an output
    gpio_init(LED_PIN);
    gpio_set_dir(LED_PIN, GPIO_OUT);

    gpio_put(LED_PIN, 1);
    sleep_ms(500);
    gpio_put(LED_PIN, 0);
    sleep_ms(2000);

    /* I2C init */
    i2c_init(I2C_PORT, 100 * 1000);
    gpio_set_function(SDA_PIN, GPIO_FUNC_I2C);
    gpio_set_function(SCL_PIN, GPIO_FUNC_I2C);
    gpio_pull_up(SDA_PIN);
    gpio_pull_up(SCL_PIN);

    
    gpio_put(LED_PIN, 1);
    sleep_ms(500);
    gpio_put(LED_PIN, 0);
    sleep_ms(2000);

    printf("AHT20 + BMP280 test started\n");

    while (true) {
    
        gpio_put(LED_PIN, 1);
        sleep_ms(500);
        gpio_put(LED_PIN, 0);
        sleep_ms(2000);
        float aht_temp, aht_hum;
        float bmp_temp;
        int32_t bmp_press;

        bool ok_aht = read_aht20(&aht_temp, &aht_hum);
        bool ok_bmp = read_bmp280(&bmp_temp, &bmp_press);
    
        gpio_put(LED_PIN, 1);
        sleep_ms(500);
        gpio_put(LED_PIN, 0);
        sleep_ms(2000);

        if (ok_aht && ok_bmp) {
            gpio_put(LED_PIN, 1);
            char msg[128];
            snprintf(msg, sizeof(msg),
                "aht_temp=%.2f,aht_hum=%.2f,bmp_temp=%.2f,bmp_press=%ld\n",
                aht_temp, aht_hum, bmp_temp, bmp_press);

            /* USB COM output */
            printf("%s", msg);
            stdio_flush();
            
            sleep_ms(500);
            gpio_put(LED_PIN, 0);
        } else {
            printf("Sensor read error\n");
        }
        sleep_ms(500);
    }
}
