#include "utils/random.h"

#include <cstdlib>

#include "pico/time.h"

namespace utils {

void EnsureRandomSeeded() {
    static bool seeded = false;
    if (!seeded) {
        srand(static_cast<unsigned>(time_us_64()));
        seeded = true;
    }
}

}  // namespace utils
