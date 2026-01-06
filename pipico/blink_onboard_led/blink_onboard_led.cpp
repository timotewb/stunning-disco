#include "pico/stdlib.h"
#include "hardware/gpio.h"
#include "pico/time.h"

const uint LED_PIN = 15; // The onboard LED is connected tothe wifi chip, so we cant seem to control it. wire up a separate LED to pin 15 to see the blinking.

int main() {
    // Initialize the standard system clock
    stdio_init_all(); 

    // Initialize the LED pin as an output
    gpio_init(LED_PIN);
    gpio_set_dir(LED_PIN, GPIO_OUT);

    // Loop forever, blinking the LED
    while (true) {
        gpio_put(LED_PIN, 1); // Turn LED on (high voltage)
        sleep_ms(500);       // Wait for 500 milliseconds
        gpio_put(LED_PIN, 0); // Turn LED off (low voltage)
        sleep_ms(500);       // Wait for another 500 milliseconds
    }
}
