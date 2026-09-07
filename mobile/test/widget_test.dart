import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:fleetintel_mobile/main.dart';

void main() {
  testWidgets('app boots to the login screen', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: FleetIntelApp()));
    await tester.pump();
    expect(find.text('FleetIntel'), findsWidgets);
  });
}
