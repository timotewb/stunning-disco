#pragma once

#include "app/measurement_types.h"

namespace telemetry {

void Init();
void Publish(const app::model::SensorSnapshot &snapshot);

}  // namespace telemetry
