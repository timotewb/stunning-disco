#pragma once

#include "app/app_config.h"
#include "app/measurement_types.h"

namespace sensors {
namespace bmp280 {

void Init();
bool Read(app::model::Bmp280Data &data);

}  // namespace bmp280
}  // namespace sensors
