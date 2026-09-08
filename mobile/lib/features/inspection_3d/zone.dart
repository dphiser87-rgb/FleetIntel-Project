/// Which face of the vehicle a zone belongs to.
enum ZoneView { side, front, rear, top }

extension ZoneViewLabel on ZoneView {
  String get label {
    switch (this) {
      case ZoneView.side:
        return 'Side';
      case ZoneView.front:
        return 'Front';
      case ZoneView.rear:
        return 'Rear';
      case ZoneView.top:
        return 'Top';
    }
  }
}

/// A tappable hotspot placed on the vehicle diagram.
/// [dx] and [dy] are normalised (0..1) positions inside the canvas.
class InspectionZone {
  final String id;
  final String label;
  final String hint;
  final ZoneView view;
  final double dx;
  final double dy;

  const InspectionZone({
    required this.id,
    required this.label,
    required this.hint,
    required this.view,
    required this.dx,
    required this.dy,
  });
}
