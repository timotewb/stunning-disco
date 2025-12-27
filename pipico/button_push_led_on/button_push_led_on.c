#include "pico/stdlib.h"

#define LED_PIN 15
#define BUTTON_PIN 16

int main(){
    // setup button
    gpio_init(LED_PIN);
    gpio_set_dir(LED_PIN, GPIO_OUT);

    // setup button
    gpio_init(BUTTON_PIN);
    gpio_set_dir(BUTTON_PIN, GPIO_IN);
    gpio_pull_up(BUTTON_PIN);

    while (true) {
        // read button state
        bool pressed = !gpio_get(BUTTON_PIN);

        // turn on LED if button is pressed
        gpio_put(LED_PIN, pressed);

        sleep_ms(10);
    }
}