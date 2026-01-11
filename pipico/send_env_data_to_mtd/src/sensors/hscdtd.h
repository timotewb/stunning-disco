#pragma once

#include "app/app_config.h"
#include "app/measurement_types.h"

namespace sensors {
namespace hscdtd {

void Init();
bool Read(app::model::HscdtdData &data);

}  // namespace hscdtd
}  // namespace sensors
