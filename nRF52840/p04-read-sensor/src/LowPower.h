#pragma once
#include <Arduino.h>

namespace LowPower {

    // Sleep using nRF52 low power wait-for-event
    inline void sleepMs(uint32_t ms) {
        uint32_t start = millis();

        while ((millis() - start) < ms) {
            __WFE();   // CPU sleep until interrupt/event
        }
    }

}
