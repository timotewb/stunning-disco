#pragma once

#include "app/app_config.h"
#include "app/measurement_types.h"

namespace sensors {
namespace aht20 {

bool Read(app::model::Aht20Data &data);

}  // namespace aht20
}  // namespace sensors
