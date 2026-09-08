/// Ported from the Primio-designed reference app's lib/models/vehicle.dart -- matches
/// backend/server.py's vehicles.type / templates.asset_class Literal exactly (see
/// VEHICLE_TYPE_TO_ASSET_CLASS), so a template's asset_class string maps straight to one of these.
enum VehicleBodyType { truck, trailer, tautliner, bus, van, suv, sedan, hatchback, bakkie }

extension VehicleBodyTypeLabel on VehicleBodyType {
  String get label {
    switch (this) {
      case VehicleBodyType.truck:
        return 'Truck';
      case VehicleBodyType.trailer:
        return 'Trailer';
      case VehicleBodyType.tautliner:
        return 'Tautliner';
      case VehicleBodyType.bus:
        return 'Bus';
      case VehicleBodyType.van:
        return 'Van';
      case VehicleBodyType.suv:
        return 'SUV';
      case VehicleBodyType.sedan:
        return 'Sedan';
      case VehicleBodyType.hatchback:
        return 'Small car';
      case VehicleBodyType.bakkie:
        return 'Bakkie';
    }
  }
}

VehicleBodyType? bodyTypeFromAssetClass(String? assetClass) {
  for (final t in VehicleBodyType.values) {
    if (t.name == assetClass) return t;
  }
  return null;
}
