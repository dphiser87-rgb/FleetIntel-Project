import 'body_type.dart';
import 'zone.dart';

/// Ported from the Primio-designed reference app's lib/services/inspection_service.dart
/// (getZonesFor) -- real, considered zone content per vehicle body type, not placeholder data.
/// One zone = one checklist item (tap it, mark Pass/Warning/Critical/N/A) -- see
/// inspection_3d_screen.dart for how these are actually presented and submitted.
List<InspectionZone> zonesForBodyType(VehicleBodyType type) {
  switch (type) {
    case VehicleBodyType.trailer:
      return const [
        InspectionZone(id: 'z-tr-01', label: 'Coupling / king pin', hint: 'Secure, greased, no play', view: ZoneView.side, dx: 0.10, dy: 0.40),
        InspectionZone(id: 'z-tr-02', label: 'Landing legs', hint: 'Wind up fully, no bending', view: ZoneView.side, dx: 0.24, dy: 0.76),
        InspectionZone(id: 'z-tr-03', label: 'Deck / load bed', hint: 'No cracks, clean surface', view: ZoneView.side, dx: 0.52, dy: 0.36),
        InspectionZone(id: 'z-tr-04', label: 'Axles & suspension', hint: 'No leaks or broken springs', view: ZoneView.side, dx: 0.85, dy: 0.72),
        InspectionZone(id: 'z-tr-05', label: 'Mudflaps', hint: 'Present and undamaged', view: ZoneView.side, dx: 0.95, dy: 0.80),
        InspectionZone(id: 'z-tr-06', label: 'Front reflectors', hint: 'Clean and visible', view: ZoneView.front, dx: 0.30, dy: 0.58),
        InspectionZone(id: 'z-tr-07', label: 'Air lines', hint: 'No chafing or leaks', view: ZoneView.front, dx: 0.50, dy: 0.40),
        InspectionZone(id: 'z-tr-08', label: 'Electrical plug', hint: 'Seated and clipped', view: ZoneView.front, dx: 0.68, dy: 0.44),
        InspectionZone(id: 'z-tr-09', label: 'Rear lights', hint: 'All lamps working', view: ZoneView.rear, dx: 0.28, dy: 0.56),
        InspectionZone(id: 'z-tr-10', label: 'Rear bumper bar', hint: 'Straight and bolted', view: ZoneView.rear, dx: 0.50, dy: 0.70),
        InspectionZone(id: 'z-tr-11', label: 'Number plate', hint: 'Legible and lit', view: ZoneView.rear, dx: 0.70, dy: 0.62),
        InspectionZone(id: 'z-tr-12', label: 'Load restraints', hint: 'Straps rated and tight', view: ZoneView.top, dx: 0.50, dy: 0.50),
        InspectionZone(id: 'z-tr-13', label: 'Tarpaulin', hint: 'No tears, fully secured', view: ZoneView.top, dx: 0.50, dy: 0.78),
      ];
    case VehicleBodyType.tautliner:
      return const [
        InspectionZone(id: 'z-tt-01', label: 'Front tyre', hint: 'Tread depth and pressure', view: ZoneView.side, dx: 0.20, dy: 0.71),
        InspectionZone(id: 'z-tt-02', label: 'Rear tyres', hint: 'No bulges, wheel nuts tight', view: ZoneView.side, dx: 0.82, dy: 0.71),
        InspectionZone(id: 'z-tt-03', label: 'Cab door', hint: 'Opens, seals and locks', view: ZoneView.side, dx: 0.16, dy: 0.50),
        InspectionZone(id: 'z-tt-04', label: 'Curtain straps', hint: 'Buckled tight, no tears', view: ZoneView.side, dx: 0.52, dy: 0.40),
        InspectionZone(id: 'z-tt-05', label: 'Curtain fabric', hint: 'No rips or loose panels', view: ZoneView.side, dx: 0.70, dy: 0.40),
        InspectionZone(id: 'z-tt-06', label: 'Roof bows', hint: 'Straight, not bent', view: ZoneView.side, dx: 0.88, dy: 0.14),
        InspectionZone(id: 'z-tt-07', label: 'Headlights', hint: 'Low and high beam', view: ZoneView.front, dx: 0.32, dy: 0.55),
        InspectionZone(id: 'z-tt-08', label: 'Windscreen', hint: 'No chips or cracks', view: ZoneView.front, dx: 0.50, dy: 0.35),
        InspectionZone(id: 'z-tt-09', label: 'Front bumper', hint: 'Secure and undamaged', view: ZoneView.front, dx: 0.62, dy: 0.68),
        InspectionZone(id: 'z-tt-10', label: 'Curtain buckles', hint: 'All latched and tensioned', view: ZoneView.rear, dx: 0.50, dy: 0.45),
        InspectionZone(id: 'z-tt-11', label: 'Rear doors', hint: 'Latches and seals intact', view: ZoneView.rear, dx: 0.50, dy: 0.66),
        InspectionZone(id: 'z-tt-12', label: 'Number plate & lights', hint: 'Legible and lit', view: ZoneView.rear, dx: 0.70, dy: 0.60),
        InspectionZone(id: 'z-tt-13', label: 'Roof sheet', hint: 'No pooling water or tears', view: ZoneView.top, dx: 0.55, dy: 0.30),
        InspectionZone(id: 'z-tt-14', label: 'Load restraints', hint: 'Straps rated and tight', view: ZoneView.top, dx: 0.55, dy: 0.70),
      ];
    case VehicleBodyType.bus:
      return const [
        InspectionZone(id: 'z-bs-01', label: 'Front tyres', hint: 'Tread depth and pressure', view: ZoneView.side, dx: 0.18, dy: 0.72),
        InspectionZone(id: 'z-bs-02', label: 'Rear tyres', hint: 'No bulges, wheel nuts tight', view: ZoneView.side, dx: 0.82, dy: 0.72),
        InspectionZone(id: 'z-bs-03', label: 'Passenger door', hint: 'Opens, closes and seals', view: ZoneView.side, dx: 0.24, dy: 0.52),
        InspectionZone(id: 'z-bs-04', label: 'Side windows', hint: 'No cracks, emergency latches free', view: ZoneView.side, dx: 0.56, dy: 0.28),
        InspectionZone(id: 'z-bs-05', label: 'Luggage bays', hint: 'Doors latch, no damage', view: ZoneView.side, dx: 0.62, dy: 0.60),
        InspectionZone(id: 'z-bs-06', label: 'Side mirror', hint: 'Clean and adjusted', view: ZoneView.side, dx: 0.10, dy: 0.30),
        InspectionZone(id: 'z-bs-07', label: 'Headlights', hint: 'Low and high beam', view: ZoneView.front, dx: 0.30, dy: 0.56),
        InspectionZone(id: 'z-bs-08', label: 'Windscreen', hint: 'No chips or cracks', view: ZoneView.front, dx: 0.50, dy: 0.33),
        InspectionZone(id: 'z-bs-09', label: 'Destination board', hint: 'Display legible and lit', view: ZoneView.front, dx: 0.50, dy: 0.25),
        InspectionZone(id: 'z-bs-10', label: 'Front bumper', hint: 'Secure and undamaged', view: ZoneView.front, dx: 0.62, dy: 0.69),
        InspectionZone(id: 'z-bs-11', label: 'Tail lights', hint: 'Brake and indicator', view: ZoneView.rear, dx: 0.30, dy: 0.55),
        InspectionZone(id: 'z-bs-12', label: 'Engine bay hatch', hint: 'Closed, no oil leaks', view: ZoneView.rear, dx: 0.50, dy: 0.42),
        InspectionZone(id: 'z-bs-13', label: 'Number plate', hint: 'Legible and lit', view: ZoneView.rear, dx: 0.68, dy: 0.62),
        InspectionZone(id: 'z-bs-14', label: 'Roof hatches', hint: 'Closed and sealed', view: ZoneView.top, dx: 0.50, dy: 0.30),
        InspectionZone(id: 'z-bs-15', label: 'Aircon unit', hint: 'Mounted, no debris', view: ZoneView.top, dx: 0.50, dy: 0.66),
      ];
    case VehicleBodyType.van:
      return const [
        InspectionZone(id: 'z-vn-01', label: 'Front tyre', hint: 'Tread depth and pressure', view: ZoneView.side, dx: 0.21, dy: 0.72),
        InspectionZone(id: 'z-vn-02', label: 'Rear tyre', hint: 'No bulges, wheel nuts tight', view: ZoneView.side, dx: 0.80, dy: 0.72),
        InspectionZone(id: 'z-vn-03', label: 'Driver door', hint: 'Opens, seals and locks', view: ZoneView.side, dx: 0.30, dy: 0.52),
        InspectionZone(id: 'z-vn-04', label: 'Sliding side door', hint: 'Runs freely, latches shut', view: ZoneView.side, dx: 0.58, dy: 0.46),
        InspectionZone(id: 'z-vn-05', label: 'Cargo panels', hint: 'No dents or scrapes', view: ZoneView.side, dx: 0.78, dy: 0.40),
        InspectionZone(id: 'z-vn-06', label: 'Side mirror', hint: 'Clean and adjusted', view: ZoneView.side, dx: 0.14, dy: 0.36),
        InspectionZone(id: 'z-vn-07', label: 'Headlights', hint: 'Low and high beam', view: ZoneView.front, dx: 0.30, dy: 0.56),
        InspectionZone(id: 'z-vn-08', label: 'Windscreen', hint: 'No chips or cracks', view: ZoneView.front, dx: 0.50, dy: 0.33),
        InspectionZone(id: 'z-vn-09', label: 'Wipers', hint: 'Blades intact, washer works', view: ZoneView.front, dx: 0.36, dy: 0.44),
        InspectionZone(id: 'z-vn-10', label: 'Front bumper', hint: 'Secure and undamaged', view: ZoneView.front, dx: 0.62, dy: 0.69),
        InspectionZone(id: 'z-vn-11', label: 'Rear barn doors', hint: 'Both latch and seal', view: ZoneView.rear, dx: 0.50, dy: 0.42),
        InspectionZone(id: 'z-vn-12', label: 'Tail lights', hint: 'Brake and indicator', view: ZoneView.rear, dx: 0.30, dy: 0.55),
        InspectionZone(id: 'z-vn-13', label: 'Number plate', hint: 'Legible and lit', view: ZoneView.rear, dx: 0.68, dy: 0.62),
        InspectionZone(id: 'z-vn-14', label: 'Roof', hint: 'No dents, racks secure', view: ZoneView.top, dx: 0.50, dy: 0.30),
        InspectionZone(id: 'z-vn-15', label: 'Load area', hint: 'Cargo restrained evenly', view: ZoneView.top, dx: 0.50, dy: 0.68),
      ];
    case VehicleBodyType.truck:
    case VehicleBodyType.suv:
    case VehicleBodyType.sedan:
    case VehicleBodyType.hatchback:
    case VehicleBodyType.bakkie:
      final heavy = type == VehicleBodyType.truck;
      return [
        const InspectionZone(id: 'z-s-01', label: 'Front tyre', hint: 'Tread depth and pressure', view: ZoneView.side, dx: 0.22, dy: 0.71),
        const InspectionZone(id: 'z-s-02', label: 'Rear tyre', hint: 'No bulges, wheel nuts tight', view: ZoneView.side, dx: 0.78, dy: 0.71),
        const InspectionZone(id: 'z-s-03', label: 'Driver door', hint: 'Opens, seals and locks', view: ZoneView.side, dx: 0.42, dy: 0.52),
        const InspectionZone(id: 'z-s-04', label: 'Side panels', hint: 'No dents or scrapes', view: ZoneView.side, dx: 0.63, dy: 0.50),
        const InspectionZone(id: 'z-s-05', label: 'Side mirror', hint: 'Clean and adjusted', view: ZoneView.side, dx: 0.30, dy: 0.34),
        const InspectionZone(id: 'z-s-06', label: 'Fuel cap', hint: 'Sealed, no leaks', view: ZoneView.side, dx: 0.88, dy: 0.58),
        if (heavy)
          const InspectionZone(id: 'z-s-07', label: 'Cab steps', hint: 'Firm and non-slip', view: ZoneView.side, dx: 0.13, dy: 0.62),
        const InspectionZone(id: 'z-f-01', label: 'Left headlight', hint: 'Low and high beam', view: ZoneView.front, dx: 0.27, dy: 0.56),
        const InspectionZone(id: 'z-f-02', label: 'Right headlight', hint: 'Low and high beam', view: ZoneView.front, dx: 0.73, dy: 0.56),
        const InspectionZone(id: 'z-f-03', label: 'Grille', hint: 'Clear of debris', view: ZoneView.front, dx: 0.50, dy: 0.52),
        const InspectionZone(id: 'z-f-04', label: 'Windscreen', hint: 'No chips or cracks', view: ZoneView.front, dx: 0.50, dy: 0.33),
        const InspectionZone(id: 'z-f-05', label: 'Wipers', hint: 'Blades intact, washer works', view: ZoneView.front, dx: 0.35, dy: 0.44),
        const InspectionZone(id: 'z-f-06', label: 'Front bumper', hint: 'Secure and undamaged', view: ZoneView.front, dx: 0.62, dy: 0.69),
        const InspectionZone(id: 'z-r-01', label: 'Left tail light', hint: 'Brake and indicator', view: ZoneView.rear, dx: 0.27, dy: 0.55),
        const InspectionZone(id: 'z-r-02', label: 'Right tail light', hint: 'Brake and indicator', view: ZoneView.rear, dx: 0.73, dy: 0.55),
        const InspectionZone(id: 'z-r-03', label: 'Tailgate / rear door', hint: 'Latches properly', view: ZoneView.rear, dx: 0.50, dy: 0.40),
        const InspectionZone(id: 'z-r-04', label: 'Rear bumper', hint: 'Straight and secure', view: ZoneView.rear, dx: 0.50, dy: 0.70),
        const InspectionZone(id: 'z-r-05', label: 'Number plate', hint: 'Legible and lit', view: ZoneView.rear, dx: 0.66, dy: 0.62),
        const InspectionZone(id: 'z-t-01', label: 'Roof', hint: 'No dents or debris', view: ZoneView.top, dx: 0.50, dy: 0.24),
        const InspectionZone(id: 'z-t-02', label: 'Cargo area', hint: 'Load evenly distributed', view: ZoneView.top, dx: 0.50, dy: 0.58),
        const InspectionZone(id: 'z-t-03', label: 'Tie-down points', hint: 'Anchors undamaged', view: ZoneView.top, dx: 0.30, dy: 0.80),
        const InspectionZone(id: 'z-t-04', label: 'Aerial / beacons', hint: 'Fitted and working', view: ZoneView.top, dx: 0.70, dy: 0.14),
      ];
  }
}
