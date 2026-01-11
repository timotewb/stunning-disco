#pragma once

#include "hardware/i2c.h"
#include "hardware/uart.h"
#include "hardware/gpio.h"

namespace app {
namespace config {

inline i2c_inst_t *const I2C_PORT = i2c1;
constexpr uint SDA_PIN = 2;
constexpr uint SCL_PIN = 3;

constexpr uint8_t AHT20_ADDR = 0x38;
constexpr uint8_t BMP280_ADDR = 0x77;
constexpr uint8_t MPU6050_ADDR = 0x68;
constexpr uint8_t VEML7700_ADDR = 0x10;
constexpr uint8_t HSCDTD_ADDR = 0x0C;
constexpr uint8_t DISPLAY_ADDR = 0x3C;

constexpr uint LED_PIN = 15;

inline uart_inst_t *const MESH_UART = uart0;
constexpr uint BAUD_RATE = 115200;
constexpr uint UART_TX_PIN = 0;
constexpr uint UART_RX_PIN = 1;

inline uart_inst_t *const GPS_UART = uart1;
constexpr uint GPS_BAUD = 9600;
constexpr uint GPS_TX_PIN = 6;  // Pico TX -> GPS RX
constexpr uint GPS_RX_PIN = 7;  // Pico RX <- GPS TX

constexpr uint I2C_FREQUENCY_HZ = 100 * 1000;

}  // namespace config
}  // namespace app
