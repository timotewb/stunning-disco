#pragma once

#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_AHTX0.h>
#include <Adafruit_BMP280.h>

class SensorManager {
public:
    SensorManager(uint8_t sda, uint8_t scl, uint8_t led)
        : _sda(sda), _scl(scl), _led(led) {}

    void begin() {
        pinMode(_led, OUTPUT);
        digitalWrite(_led, LOW);

        Serial.println();
        Serial.println("Initializing Sensors...");

        Wire.setPins(_sda, _scl);
        Wire.setClock(100000);

        if (!_aht.begin()) {
            Serial.println("ERROR: AHT20 not found");
            errorBlink();
        }

        if (!_bmp.begin(0x77)) {
            Serial.println("ERROR: BMP280 not found");
            errorBlink();
        }

        Serial.println("Sensors initialized successfully");
        Serial.println();
    }

    void readAndPrint() {
        digitalWrite(_led, HIGH);

        sensors_event_t humidity, temp;
        _aht.getEvent(&humidity, &temp);

        float pressure = _bmp.readPressure() / 100.0;
        float altitude = _bmp.readAltitude(1013.25);

        Serial.println("----- Sensor Data -----");

        Serial.print("Temperature: ");
        Serial.print(temp.temperature);
        Serial.println(" °C");

        Serial.print("Humidity: ");
        Serial.print(humidity.relative_humidity);
        Serial.println(" %");

        Serial.print("Pressure: ");
        Serial.print(pressure);
        Serial.println(" hPa");

        Serial.print("Altitude: ");
        Serial.print(altitude);
        Serial.println(" m");

        Serial.println();

        digitalWrite(_led, LOW);
    }

private:
    uint8_t _sda;
    uint8_t _scl;
    uint8_t _led;

    Adafruit_AHTX0 _aht;
    Adafruit_BMP280 _bmp;

    void errorBlink() {
        while (1) {
            digitalWrite(_led, HIGH);
            delay(200);
            digitalWrite(_led, LOW);
            delay(200);
        }
    }
};
