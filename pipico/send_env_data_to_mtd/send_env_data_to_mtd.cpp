#include <stdio.h>
#include <math.h>
#include "pico/stdlib.h"
#include "hardware/i2c.h"
#include "hardware/uart.h"
#include "hardware/gpio.h"

/* ---------- CONFIG ---------- */
#define I2C_PORT i2c1
#define SDA_PIN 2
#define SCL_PIN 3

#define AHT20_ADDR  0x38
#define BMP280_ADDR 0x77   // try 0x77 if needed

const uint LED_PIN = 15;

#define UART_ID uart1
#define BAUD_RATE 115200

#define UART_TX_PIN 8
#define UART_RX_PIN 9


/* ---------------- UART ---------------- */
void uart_init_custom() {
    uart_init(UART_ID, BAUD_RATE);

    // Set the TX and RX pins by function
    gpio_set_function(UART_TX_PIN, GPIO_FUNC_UART);
    gpio_set_function(UART_RX_PIN, GPIO_FUNC_UART);

    // Optional: set FIFO / flow control
    uart_set_fifo_enabled(UART_ID, true);
}

void uart_send_string(const char* str) {
    uart_puts(UART_ID, str);
}

/* ---------------- AHT20 ---------------- */

bool read_aht20(float *temp_c, float *humidity, uint8_t *status) {
    uint8_t cmd[3] = {0xAC, 0x33, 0x00};
    if (i2c_write_blocking(I2C_PORT, AHT20_ADDR, cmd, 3, false) != 3)
        return false;

    sleep_ms(80);

    uint8_t data[6];
    if (i2c_read_blocking(I2C_PORT, AHT20_ADDR, data, 6, false) != 6)
        return false;

    *status = data[0];

    uint32_t raw_hum =
        ((uint32_t)data[1] << 12) |
        ((uint32_t)data[2] << 4) |
        (data[3] >> 4);

    uint32_t raw_temp =
        ((uint32_t)(data[3] & 0x0F) << 16) |
        ((uint32_t)data[4] << 8) |
        data[5];

    *humidity = (raw_hum * 100.0f) / 1048576.0f;
    *temp_c   = (raw_temp * 200.0f) / 1048576.0f - 50.0f;

    return true;
}

/* ---------------- BMP280 ---------------- */

struct bmp280_calib {
    uint16_t dig_T1;
    int16_t  dig_T2, dig_T3;
    uint16_t dig_P1;
    int16_t  dig_P2, dig_P3, dig_P4, dig_P5;
    int16_t  dig_P6, dig_P7, dig_P8, dig_P9;
};

bmp280_calib bmp_cal;
int32_t t_fine;

void bmp280_read_calibration() {
    uint8_t reg = 0x88;
    uint8_t buf[24];

    i2c_write_blocking(I2C_PORT, BMP280_ADDR, &reg, 1, true);
    i2c_read_blocking(I2C_PORT, BMP280_ADDR, buf, 24, false);

    bmp_cal.dig_T1 = buf[1] << 8 | buf[0];
    bmp_cal.dig_T2 = buf[3] << 8 | buf[2];
    bmp_cal.dig_T3 = buf[5] << 8 | buf[4];

    bmp_cal.dig_P1 = buf[7] << 8 | buf[6];
    bmp_cal.dig_P2 = buf[9] << 8 | buf[8];
    bmp_cal.dig_P3 = buf[11] << 8 | buf[10];
    bmp_cal.dig_P4 = buf[13] << 8 | buf[12];
    bmp_cal.dig_P5 = buf[15] << 8 | buf[14];
    bmp_cal.dig_P6 = buf[17] << 8 | buf[16];
    bmp_cal.dig_P7 = buf[19] << 8 | buf[18];
    bmp_cal.dig_P8 = buf[21] << 8 | buf[20];
    bmp_cal.dig_P9 = buf[23] << 8 | buf[22];
}

void bmp280_init() {
    uint8_t ctrl_meas[2] = {0xF4, 0x27}; // temp+press oversampling, normal mode
    uint8_t config[2]    = {0xF5, 0xA0}; // standby 1000ms, filter on

    i2c_write_blocking(I2C_PORT, BMP280_ADDR, ctrl_meas, 2, false);
    i2c_write_blocking(I2C_PORT, BMP280_ADDR, config, 2, false);
}

void bmp280_read_raw(int32_t *adc_t, int32_t *adc_p) {
    uint8_t reg = 0xF7;
    uint8_t buf[6];

    i2c_write_blocking(I2C_PORT, BMP280_ADDR, &reg, 1, true);
    i2c_read_blocking(I2C_PORT, BMP280_ADDR, buf, 6, false);

    *adc_p = (buf[0] << 12) | (buf[1] << 4) | (buf[2] >> 4);
    *adc_t = (buf[3] << 12) | (buf[4] << 4) | (buf[5] >> 4);
}

float bmp280_comp_temp(int32_t adc_T) {
    int32_t var1, var2;
    var1 = ((((adc_T >> 3) - ((int32_t)bmp_cal.dig_T1 << 1))) *
           ((int32_t)bmp_cal.dig_T2)) >> 11;
    var2 = (((((adc_T >> 4) - ((int32_t)bmp_cal.dig_T1)) *
           ((adc_T >> 4) - ((int32_t)bmp_cal.dig_T1))) >> 12) *
           ((int32_t)bmp_cal.dig_T3)) >> 14;

    t_fine = var1 + var2;
    return (t_fine * 5 + 128) / 256.0f / 100.0f;
}

float bmp280_comp_press(int32_t adc_P) {
    int64_t var1, var2, p;
    var1 = ((int64_t)t_fine) - 128000;
    var2 = var1 * var1 * (int64_t)bmp_cal.dig_P6;
    var2 += (var1 * (int64_t)bmp_cal.dig_P5) << 17;
    var2 += ((int64_t)bmp_cal.dig_P4) << 35;
    var1 = ((var1 * var1 * (int64_t)bmp_cal.dig_P3) >> 8) +
           ((var1 * (int64_t)bmp_cal.dig_P2) << 12);
    var1 = (((((int64_t)1) << 47) + var1)) * ((int64_t)bmp_cal.dig_P1) >> 33;

    if (var1 == 0) return 0;

    p = 1048576 - adc_P;
    p = (((p << 31) - var2) * 3125) / var1;
    var1 = ((int64_t)bmp_cal.dig_P9 * (p >> 13) * (p >> 13)) >> 25;
    var2 = ((int64_t)bmp_cal.dig_P8 * p) >> 19;
    p = ((p + var1 + var2) >> 8) + (((int64_t)bmp_cal.dig_P7) << 4);

    return p / 256.0f;
}

/* ---------- MAIN ---------- */
int main() {
    stdio_init_all();

    // Initialize the LED pin as an output
    gpio_init(LED_PIN);
    gpio_set_dir(LED_PIN, GPIO_OUT);

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

    bmp280_read_calibration();
    bmp280_init();

    printf("AHT20 + BMP280 calibrated\n");

    while (true) {
        float aht_t, aht_h;
        uint8_t aht_status;

        int32_t adc_t, adc_p;

        if (read_aht20(&aht_t, &aht_h, &aht_status)) {
            gpio_put(LED_PIN, 1);
            bmp280_read_raw(&adc_t, &adc_p);
            float bmp_t = bmp280_comp_temp(adc_t);
            float bmp_p = bmp280_comp_press(adc_p);
            float altitude = 44330.0f * (1.0f - pow(bmp_p / 101325.0f, 0.1903f));


            // After reading sensors
            char buf[128];
            snprintf(buf, sizeof(buf),
                    "uart>ahtT=%.2f,ahtH=%.2f,bmpT=%.2f,bmpP=%.2f,alt=%.2f\n",
                    aht_t, aht_h,
                    bmp_t, bmp_p,
                    altitude);

            // Send over USB for debugging
            printf("%s", buf);

            // Send over UART to Meshtastic
            uart_send_string(buf);
            stdio_flush();
            
            sleep_ms(50);
            gpio_put(LED_PIN, 0);
        } else {
            printf("AHT20 read error\n");
        }

        sleep_ms(2000);
    }
}
