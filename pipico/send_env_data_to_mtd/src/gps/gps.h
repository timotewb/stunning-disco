#pragma once

#include <cstddef>

#include "app/app_config.h"
#include "app/measurement_types.h"

namespace gps {

void Init();
void Poll(app::model::GpsData &data);

}  // namespace gps
