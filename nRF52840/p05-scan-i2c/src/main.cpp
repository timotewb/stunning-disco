#include <Arduino.h>
#include <Wire.h>
#include <map>
#include <string>

// ====== CONFIG ======
#define SDA_PIN PIN_104
#define SCL_PIN PIN_106
#define LED_PIN PIN_015   // nice!nano onboard LED

// A small database of common I2C addresses and their likely identities
// This is the "human readable" part of the MVP
std::map<uint8_t, std::string> i2c_device_map = {
    {0x27, "LCD (PCF8574)"},
    {0x3F, "LCD (PCF8574)"},
    {0x68, "RTC (DS1307/DS3231) or MPU6050"},
    {0x76, "BMP280 / BME280 / AHT10"},
    {0x77, "BMP280 / BME280"},
    {0x3C, "OLED (SSD1306)"},
    {0x3D, "OLED (SSD1306)"},
    {0x50, "EEPROM (AT24C series)"},
    {0x53, "ADXL345 Accelerometer"}
};

// ====== STARTUP BLINK ======
void startupDelay() {
    Serial.println();
    Serial.println("================================================");
    Serial.println("       I2C AUTO-DETECTION SYSTEM v1.0           ");
    Serial.println("================================================");
    Serial.println("Booting... waiting 5 seconds");
    Serial.println("Open Serial Monitor NOW");
    Serial.println("================================================");

    for (int i = 0; i < 10; i++) {
        digitalWrite(LED_PIN, HIGH);
        delay(100);
        digitalWrite(LED_PIN, LOW);
        delay(100);
    }

    Serial.println("Starting I2C scanner...");
    Serial.println();
}

// ====== I2C SCANNER ======
void scanI2C() {
    Serial.println("Scanning I2C bus...");
    Serial.println("Addr | Device Identity");
    Serial.println("--------------------------------");

    int foundDevices = 0;

    for (uint8_t address = 1; address < 127; address++) {
        Wire.beginTransmission(address);
        uint8_t error = Wire.endTransmission();

        if (error == 0) {
            // Found a device!
            Serial.print("0x");
            if (address < 16) Serial.print("0");
            Serial.print(address, HEX);
            Serial.print(" | ");

            // Try to resolve the identity
            if (i2c_device_map.count(address)) {
                Serial.print(i2c_device_map[address].c_str());
            } else {
                Serial.print("Unknown Device");
            }
            Serial.println();

            // Blink LED quickly when device found
            digitalWrite(LED_PIN, HIGH);
            delay(50);
            digitalWrite(LED_PIN, LOW);

            foundDevices++;
        }
    }

    if (foundDevices == 0) {
        Serial.println("No I2C devices found.");
    } else {
        Serial.print("Scan complete. Devices found: ");
        Serial.println(foundDevices);
    }

    Serial.println("--------------------------------");
    Serial.println();
}

void setup() {
    pinMode(LED_PIN, OUTPUT);
    digitalWrite(LED_PIN, LOW);

    Serial.begin(115200);

    // Small delay to allow USB to enumerate
    delay(500);

    // Wait until Serial is ready
    while (!Serial && millis() < 5000) {
        // wait max 5s
    }

    startupDelay();

    // Initialize I2C
    Wire.setPins(SDA_PIN, SCL_PIN);
    Wire.begin();
}

void loop() {
    scanI2C();

    Serial.println("Waiting 10 seconds before next scan...");

    // Slow LED heartbeat during wait
    for (int i = 0; i < 10; i++) {
        digitalWrite(LED_PIN, HIGH);
        delay(100);
        digitalWrite(LED_PIN, LOW);
        delay(900);
    }
}
