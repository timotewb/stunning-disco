#include "gps/gps.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>

#include "hardware/gpio.h"
#include "hardware/uart.h"

namespace gps {

namespace {
char line_buffer[128];
int buffer_index = 0;

void ParseGga(const char *line, app::model::GpsData &data) {
    if (std::strncmp(line, "$GNGGA", 6) != 0 && std::strncmp(line, "$GPGGA", 6) != 0) {
        return;
    }

    char temp[128];
    std::strncpy(temp, line, sizeof(temp));
    temp[sizeof(temp) - 1] = '\0';

    char *token = std::strtok(temp, ",");
    int field = 0;

    float latitude = 0.0f;
    float longitude = 0.0f;
    char lat_dir = 0;
    char lon_dir = 0;
    int fix = 0;

    while (token != nullptr) {
        token = std::strtok(nullptr, ",");
        ++field;
        if (token == nullptr) {
            break;
        }

        switch (field) {
            case 2:
                latitude = std::atof(token);
                break;
            case 3:
                lat_dir = token[0];
                break;
            case 4:
                longitude = std::atof(token);
                break;
            case 5:
                lon_dir = token[0];
                break;
            case 6:
                fix = std::atoi(token);
                break;
            default:
                break;
        }
    }

    data.fix = fix > 0;
    if (!data.fix) {
        return;
    }

    const int lat_deg = static_cast<int>(latitude / 100.0f);
    const float lat_min = latitude - lat_deg * 100.0f;
    data.latitude = lat_deg + lat_min / 60.0f;
    if (lat_dir == 'S') {
        data.latitude = -data.latitude;
    }

    const int lon_deg = static_cast<int>(longitude / 100.0f);
    const float lon_min = longitude - lon_deg * 100.0f;
    data.longitude = lon_deg + lon_min / 60.0f;
    if (lon_dir == 'W') {
        data.longitude = -data.longitude;
    }
}

void ParseRmc(const char *line, app::model::GpsData &data) {
    if (std::strncmp(line, "$GNRMC", 6) != 0 && std::strncmp(line, "$GPRMC", 6) != 0) {
        return;
    }

    char temp[128];
    std::strncpy(temp, line, sizeof(temp));
    temp[sizeof(temp) - 1] = '\0';

    char *token = std::strtok(temp, ",");
    int field = 0;

    float latitude = 0.0f;
    float longitude = 0.0f;
    char lat_dir = 0;
    char lon_dir = 0;
    char status = 'V';
    char time_field[16] = {0};
    char date_field[16] = {0};

    while (token != nullptr) {
        token = std::strtok(nullptr, ",");
        ++field;
        if (token == nullptr) {
            break;
        }

        switch (field) {
            case 1:
                std::strncpy(time_field, token, sizeof(time_field) - 1);
                break;
            case 2:
                status = token[0];
                break;
            case 3:
                latitude = std::atof(token);
                break;
            case 4:
                lat_dir = token[0];
                break;
            case 5:
                longitude = std::atof(token);
                break;
            case 6:
                lon_dir = token[0];
                break;
            case 9:
                std::strncpy(date_field, token, sizeof(date_field) - 1);
                break;
            default:
                break;
        }
    }

    if (status != 'A') {
        data.fix = false;
        data.datetime_valid = false;
        return;
    }

    if (latitude != 0.0f && longitude != 0.0f) {
        const int lat_deg = static_cast<int>(latitude / 100.0f);
        const float lat_min = latitude - lat_deg * 100.0f;
        data.latitude = lat_deg + lat_min / 60.0f;
        if (lat_dir == 'S') {
            data.latitude = -data.latitude;
        }

        const int lon_deg = static_cast<int>(longitude / 100.0f);
        const float lon_min = longitude - lon_deg * 100.0f;
        data.longitude = lon_deg + lon_min / 60.0f;
        if (lon_dir == 'W') {
            data.longitude = -data.longitude;
        }
        data.fix = true;
    }

    if (std::strlen(time_field) >= 6 && std::strlen(date_field) == 6) {
        char hh[3] = {time_field[0], time_field[1], '\0'};
        char mm[3] = {time_field[2], time_field[3], '\0'};
        char ss[3] = {time_field[4], time_field[5], '\0'};

        char dd[3] = {date_field[0], date_field[1], '\0'};
        char mo[3] = {date_field[2], date_field[3], '\0'};
        char yy[3] = {date_field[4], date_field[5], '\0'};

        const int year = 2000 + std::atoi(yy);
        const int month = std::atoi(mo);
        const int day = std::atoi(dd);
        const int hour = std::atoi(hh);
        const int minute = std::atoi(mm);
        const int second = std::atoi(ss);

        std::snprintf(data.datetime, sizeof(data.datetime), "%04d%02d%02d %02d%02d%02d",
                      year, month, day, hour, minute, second);
        data.datetime_valid = true;
    } else {
        data.datetime_valid = false;
    }
}

bool ReadLine(char *out, std::size_t maxlen) {
    while (uart_is_readable(app::config::GPS_UART)) {
        char ch = uart_getc(app::config::GPS_UART);

        if (ch == '\r') {
            continue;
        }

        if (ch == '\n') {
            const int copy_len = buffer_index < static_cast<int>(maxlen - 1)
                                     ? buffer_index
                                     : static_cast<int>(maxlen - 1);
            std::memcpy(out, line_buffer, copy_len);
            out[copy_len] = '\0';
            buffer_index = 0;
            return true;
        }

        if (buffer_index < static_cast<int>(sizeof(line_buffer) - 1)) {
            line_buffer[buffer_index++] = ch;
        } else {
            buffer_index = 0;
        }
    }
    return false;
}

}  // namespace

void Init() {
    uart_init(app::config::GPS_UART, app::config::GPS_BAUD);
    gpio_set_function(app::config::GPS_TX_PIN, GPIO_FUNC_UART);
    gpio_set_function(app::config::GPS_RX_PIN, GPIO_FUNC_UART);
    uart_set_fifo_enabled(app::config::GPS_UART, true);
}

void Poll(app::model::GpsData &data) {
    char line[sizeof(line_buffer)];
    while (ReadLine(line, sizeof(line))) {
        ParseGga(line, data);
        ParseRmc(line, data);
    }
}

}  // namespace gps
