#include "display/display.h"

#include <cstdio>
#include <cstdlib>

#include "app/app_config.h"
#include "ssd1306.h"
#include "textRenderer/TextRenderer.h"
#include "utils/random.h"

namespace display {

namespace {
using pico_ssd1306::SSD1306;
using pico_ssd1306::Size;

constexpr int kMaxEntries = 16;
constexpr int kMaxLineLength = 24;

SSD1306 &Screen() {
    static SSD1306 instance(app::config::I2C_PORT, app::config::DISPLAY_ADDR, Size::W128xH32);
    return instance;
}

void Shuffle(int *indices, int count) {
    utils::EnsureRandomSeeded();
    for (int i = count - 1; i > 0; --i) {
        const int j = std::rand() % (i + 1);
        const int tmp = indices[i];
        indices[i] = indices[j];
        indices[j] = tmp;
    }
}

}  // namespace

void Init() {
    SSD1306 &display = Screen();
    display.setOrientation(0);
}

void Render(const app::model::SensorSnapshot &snapshot) {
    SSD1306 &oled = Screen();
    oled.clear();

    char temperature_line[kMaxLineLength];
    std::snprintf(temperature_line, sizeof(temperature_line), "AHT T:%5.1fC", snapshot.aht20.temperature_c);

    const char *line_ptrs[4];
    int line_count = 0;
    line_ptrs[line_count++] = temperature_line;

    char gps_line[kMaxLineLength];
    if (snapshot.gps.fix && line_count < 4) {
        std::snprintf(gps_line, sizeof(gps_line), "GPS %.4f %.4f", snapshot.gps.latitude, snapshot.gps.longitude);
        line_ptrs[line_count++] = gps_line;
    }

    char entries[kMaxEntries][kMaxLineLength];
    int entry_count = 0;

    if (snapshot.aht20.valid && entry_count < kMaxEntries) {
        std::snprintf(entries[entry_count++], kMaxLineLength, "AHT H:%5.1f%%", snapshot.aht20.humidity_pct);
    }
    if (snapshot.aht20.valid && entry_count < kMaxEntries) {
        std::snprintf(entries[entry_count++], kMaxLineLength, "AHT St:0x%02X", snapshot.aht20.status);
    }
    if (snapshot.bmp280.valid && entry_count < kMaxEntries) {
        std::snprintf(entries[entry_count++], kMaxLineLength, "BMP T:%5.1fC", snapshot.bmp280.temperature_c);
    }
    if (snapshot.bmp280.valid && entry_count < kMaxEntries) {
        std::snprintf(entries[entry_count++], kMaxLineLength, "BMP P:%7.1fhPa", snapshot.bmp280.pressure_pa / 100.0f);
    }
    if (snapshot.bmp280.valid && entry_count < kMaxEntries) {
        std::snprintf(entries[entry_count++], kMaxLineLength, "BMP Alt:%6.1fm", snapshot.bmp280.altitude_m);
    }
    if (snapshot.veml7700.valid && entry_count < kMaxEntries) {
        std::snprintf(entries[entry_count++], kMaxLineLength, "VEML Lux:%6.1f", snapshot.veml7700.lux);
    }
    if (snapshot.mpu6050.valid && entry_count < kMaxEntries) {
        std::snprintf(entries[entry_count++], kMaxLineLength, "MPU T:%5.1fC", snapshot.mpu6050.temperature_c);
    }
    if (snapshot.mpu6050.valid && entry_count < kMaxEntries) {
        std::snprintf(entries[entry_count++], kMaxLineLength, "MPU Ax:%6d", snapshot.mpu6050.accel_x);
    }
    if (snapshot.mpu6050.valid && entry_count < kMaxEntries) {
        std::snprintf(entries[entry_count++], kMaxLineLength, "MPU Ay:%6d", snapshot.mpu6050.accel_y);
    }
    if (snapshot.mpu6050.valid && entry_count < kMaxEntries) {
        std::snprintf(entries[entry_count++], kMaxLineLength, "MPU Az:%6d", snapshot.mpu6050.accel_z);
    }
    if (snapshot.mpu6050.valid && entry_count < kMaxEntries) {
        std::snprintf(entries[entry_count++], kMaxLineLength, "MPU Gx:%6d", snapshot.mpu6050.gyro_x);
    }
    if (snapshot.mpu6050.valid && entry_count < kMaxEntries) {
        std::snprintf(entries[entry_count++], kMaxLineLength, "MPU Gy:%6d", snapshot.mpu6050.gyro_y);
    }
    if (snapshot.mpu6050.valid && entry_count < kMaxEntries) {
        std::snprintf(entries[entry_count++], kMaxLineLength, "MPU Gz:%6d", snapshot.mpu6050.gyro_z);
    }
    if (snapshot.hscdtd.valid && entry_count < kMaxEntries) {
        std::snprintf(entries[entry_count++], kMaxLineLength, "HSCD Head:%5.1f", snapshot.hscdtd.heading_deg);
    }
    if (snapshot.hscdtd.valid && entry_count < kMaxEntries) {
        std::snprintf(entries[entry_count++], kMaxLineLength, "HSCD X:%6d", snapshot.hscdtd.x);
    }
    if (snapshot.hscdtd.valid && entry_count < kMaxEntries) {
        std::snprintf(entries[entry_count++], kMaxLineLength, "HSCD Y:%6d", snapshot.hscdtd.y);
    }
    if (snapshot.hscdtd.valid && entry_count < kMaxEntries) {
        std::snprintf(entries[entry_count++], kMaxLineLength, "HSCD Z:%6d", snapshot.hscdtd.z);
    }

    const int desired_random = 4 - line_count;
    if (entry_count > 0 && desired_random > 0) {
        int indices[kMaxEntries];
        for (int i = 0; i < entry_count; ++i) {
            indices[i] = i;
        }
        Shuffle(indices, entry_count);
        int added = 0;
        for (int i = 0; i < entry_count && added < desired_random && line_count < 4; ++i) {
            line_ptrs[line_count++] = entries[indices[i]];
            ++added;
        }
    }

    static const char placeholder[] = "DATA ---";
    while (line_count < 4) {
        line_ptrs[line_count++] = placeholder;
    }

    for (int i = 0; i < 4; ++i) {
        const int y = i * 8;
        drawText(&oled, font_8x8, line_ptrs[i], 0, y);
    }

    oled.sendBuffer();
}

}  // namespace display
