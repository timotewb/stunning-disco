#include "pico/stdlib.h"

#define LED_PIN 15
#define LED_DELAY_MS 500

int main(){
    // initialize the chosen pin for the LED
    gpio_init(LED_PIN);
    gpio_set_dir(LED_PIN, GPIO_OUT);

    while (true){
        gpio_put(LED_PIN, 1); // turn LED on
        sleep_ms(LED_DELAY_MS);
        gpio_put(LED_PIN, 0); // turn LED off
        sleep_ms(LED_DELAY_MS);
    }
}