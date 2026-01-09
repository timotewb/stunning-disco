#include <stdio.h>
#include <math.h>
#include <string.h>
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

#define UART_ID uart0
#define BAUD_RATE 115200

#define UART_TX_PIN 0
#define UART_RX_PIN 1

#define GPS_UART uart1
#define GPS_BAUD 9600

#define GPS_TX_PIN 6   // Pico TX → GPS RX
#define GPS_RX_PIN 7   // Pico RX ← GPS TX

#define MPU6050_ADDR 0x68

// MPU6050 registers
#define MPU6050_PWR_MGMT_1 0x6B
#define MPU6050_ACCEL_XOUT_H 0x3B

#define VEML7700_ADDR 0x10

#define VEML7700_ALS_CONF  0x00
#define VEML7700_ALS_DATA  0x04

#define HSCDTD_ADDR 0x0C
/* ---------------- HSCDTD008A Compass ---------------- */
void hscdtd_init() {
    // Control register: continuous measurement mode
    // Register 0x0B, value 0x01 → continuous mode
    uint8_t cmd[2] = {0x0B, 0x01};
    i2c_write_blocking(I2C_PORT, HSCDTD_ADDR, cmd, 2, false);
}
bool hscdtd_read(int16_t *mx, int16_t *my, int16_t *mz) {
    uint8_t reg = 0x00;   // Data register start
    uint8_t buf[6];

    if (i2c_write_blocking(I2C_PORT, HSCDTD_ADDR, &reg, 1, true) != 1)
        return false;

    if (i2c_read_blocking(I2C_PORT, HSCDTD_ADDR, buf, 6, false) != 6)
        return false;

    // Big-endian signed values
    *mx = (int16_t)(buf[0] << 8 | buf[1]);
    *my = (int16_t)(buf[2] << 8 | buf[3]);
    *mz = (int16_t)(buf[4] << 8 | buf[5]);

    return true;
}
float compass_heading_deg(int16_t mx, int16_t my) {
    float heading = atan2f((float)my, (float)mx);
    heading *= 180.0f / M_PI;
    if (heading < 0) heading += 360.0f;
    return heading;
}
/* ---------------- VEML7700 ---------------- */
void veml7700_init() {
    uint8_t buf[3];

    // ALS configuration:
    // Gain = 1, Integration time = 100ms, ALS enabled
    buf[0] = VEML7700_ALS_CONF;
    buf[1] = 0x00; // LSB
    buf[2] = 0x00; // MSB

    i2c_write_blocking(I2C_PORT, VEML7700_ADDR, buf, 3, false);

    sleep_ms(100);
}
bool veml7700_read_lux(float *lux) {
    uint8_t reg = VEML7700_ALS_DATA;
    uint8_t buf[2];

    if (i2c_write_blocking(I2C_PORT, VEML7700_ADDR, &reg, 1, true) != 1)
        return false;

    if (i2c_read_blocking(I2C_PORT, VEML7700_ADDR, buf, 2, false) != 2)
        return false;

    uint16_t raw = (buf[1] << 8) | buf[0];

    // For gain=1, IT=100ms
    *lux = raw * 0.0576f;

    return true;
}
/* ---------------- MPU6050 ---------------- */
void mpu6050_init() {
    uint8_t buf[2];

    // Wake up MPU6050 (clear sleep bit)
    buf[0] = MPU6050_PWR_MGMT_1;
    buf[1] = 0x00;
    i2c_write_blocking(I2C_PORT, MPU6050_ADDR, buf, 2, false);

    sleep_ms(100);
}
bool mpu6050_read(
    int16_t *ax, int16_t *ay, int16_t *az,
    int16_t *gx, int16_t *gy, int16_t *gz,
    float *temp_c
) {
    uint8_t reg = MPU6050_ACCEL_XOUT_H;
    uint8_t buf[14];

    if (i2c_write_blocking(I2C_PORT, MPU6050_ADDR, &reg, 1, true) != 1)
        return false;

    if (i2c_read_blocking(I2C_PORT, MPU6050_ADDR, buf, 14, false) != 14)
        return false;

    *ax = (buf[0] << 8) | buf[1];
    *ay = (buf[2] << 8) | buf[3];
    *az = (buf[4] << 8) | buf[5];

    int16_t raw_temp = (buf[6] << 8) | buf[7];
    *temp_c = raw_temp / 340.0f + 36.53f;

    *gx = (buf[8] << 8) | buf[9];
    *gy = (buf[10] << 8) | buf[11];
    *gz = (buf[12] << 8) | buf[13];

    return true;
}


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

void gps_uart_init() {
    uart_init(GPS_UART, GPS_BAUD);
    gpio_set_function(GPS_TX_PIN, GPIO_FUNC_UART);
    gpio_set_function(GPS_RX_PIN, GPIO_FUNC_UART);
    uart_set_fifo_enabled(GPS_UART, true);
}


/* ---------------- GPS (ATGM336H) ---------------- */
char gps_line[128];
int gps_idx = 0;

float gps_lat = NAN;
float gps_lon = NAN;
bool gps_fix = false;

bool gps_read_line(char *out, size_t maxlen) {
    while (uart_is_readable(GPS_UART)) {
        char c = uart_getc(GPS_UART);

        if (c == '\n') {
            out[gps_idx] = 0;
            gps_idx = 0;
            return true;
        }

        if (gps_idx < (int)maxlen - 1) {
            out[gps_idx++] = c;
        }
    }
    return false;
}

void parse_gga(const char *line) {
    if (strncmp(line, "$GNGGA", 6) != 0 &&
        strncmp(line, "$GPGGA", 6) != 0) {
        return;
    }

    char buf[128];
    strncpy(buf, line, sizeof(buf));
    buf[sizeof(buf) - 1] = 0;

    char *tok = strtok(buf, ",");
    int field = 0;

    float lat = 0, lon = 0;
    char lat_dir = 0, lon_dir = 0;
    int fix = 0;

    while (tok) {
        tok = strtok(NULL, ",");
        field++;

        if (!tok) break;

        switch (field) {
            case 2: lat = atof(tok); break;
            case 3: lat_dir = tok[0]; break;
            case 4: lon = atof(tok); break;
            case 5: lon_dir = tok[0]; break;
            case 6: fix = atoi(tok); break;
        }
    }

    if (fix > 0) {
        int lat_deg = (int)(lat / 100);
        float lat_min = lat - lat_deg * 100;
        gps_lat = lat_deg + lat_min / 60.0f;
        if (lat_dir == 'S') gps_lat = -gps_lat;

        int lon_deg = (int)(lon / 100);
        float lon_min = lon - lon_deg * 100;
        gps_lon = lon_deg + lon_min / 60.0f;
        if (lon_dir == 'W') gps_lon = -gps_lon;

        gps_fix = true;
    }
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

    /* UART init */
    uart_init_custom();   // ESP32 UART (unchanged)
    gps_uart_init();      // GPS UART (NEW)
    
    gpio_put(LED_PIN, 1);
    sleep_ms(500);
    gpio_put(LED_PIN, 0);
    sleep_ms(2000);

    bmp280_read_calibration();
    bmp280_init();
    mpu6050_init();
    veml7700_init();
    hscdtd_init();

    printf("AHT20 + BMP280 + MPU6050 + VEML7700 + HSCDTD008A ready\n");

    while (true) {
        float aht_t, aht_h;
        uint8_t aht_status;

        int32_t adc_t, adc_p;

        /* read gps */
        char line[128];
        if (gps_read_line(line, sizeof(line))) {
            parse_gga(line);
        }

        /* read mpu6050 */
        int16_t ax, ay, az, gx, gy, gz;
        float mpu_temp;

        bool mpu_ok = mpu6050_read(
            &ax, &ay, &az,
            &gx, &gy, &gz,
            &mpu_temp
        );

        // read veml7700
        float lux = 0.0f;
        bool veml_ok = veml7700_read_lux(&lux);

        // read hscdtd008a
        int16_t mag_x = 0, mag_y = 0, mag_z = 0;
        float heading = NAN;
        bool mag_ok = hscdtd_read(&mag_x, &mag_y, &mag_z);
        if (mag_ok) {
            heading = compass_heading_deg(mag_x, mag_y);
        }

        if (read_aht20(&aht_t, &aht_h, &aht_status)) {
            gpio_put(LED_PIN, 1);
            bmp280_read_raw(&adc_t, &adc_p);
            float bmp_t = bmp280_comp_temp(adc_t);
            float bmp_p = bmp280_comp_press(adc_p);
            float altitude = 44330.0f * (1.0f - pow(bmp_p / 101325.0f, 0.1903f));


            // After reading sensors
            char buf[320];
            int len = snprintf(buf, sizeof(buf),
                "ahtT=%.2f,ahtH=%.2f,ahtStatus=0x%02X,"
                "bmpT=%.2f,bmpP=%.2f,alt=%.2f,"
                "mpuOk=%d,ax=%d,ay=%d,az=%d,gx=%d,gy=%d,gz=%d,mpuT=%.2f,"
                "luxOk=%d,lux=%.2f,"
                "magOk=%d,magX=%d,magY=%d,magZ=%d,head=%.1f,"
                "gpsfix=%d",
                aht_t, aht_h, aht_status,
                bmp_t, bmp_p, altitude,
                mpu_ok ? 1 : 0, ax, ay, az, gx, gy, gz, mpu_temp,
                veml_ok ? 1 : 0, veml_ok ? lux : NAN,
                mag_ok ? 1 : 0, mag_x, mag_y, mag_z, mag_ok ? heading : NAN,
                gps_fix ? 1 : 0
            );
            if (len > 0 && len < (int)sizeof(buf)) {
                if (gps_fix) {
                    len += snprintf(buf + len, sizeof(buf) - len, ",lat=%.6f,lon=%.6f\n", gps_lat, gps_lon);
                } else {
                    snprintf(buf + len, sizeof(buf) - len, "\n");
                }
            }

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

        sleep_ms(10000);
    }
}
