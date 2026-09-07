// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appName => 'FleetIntel';

  @override
  String get loginTitle => 'Log in';

  @override
  String get loginIdentifierLabel => 'Email or phone number';

  @override
  String get loginPasswordLabel => 'Password';

  @override
  String get loginButton => 'Log in';

  @override
  String get loginError => 'Invalid credentials';

  @override
  String welcomeMessage(String name) {
    return 'Welcome, $name';
  }

  @override
  String get welcomeSubtitleDriver =>
      'Let\'s check your vehicle before you head out.';

  @override
  String get vehicleConfirmTitle => 'Confirm your vehicle';

  @override
  String get vehicleConfirmSubtitle =>
      'Is this the vehicle you\'re driving today?';

  @override
  String get vehicleConfirmYes => 'Yes, this is correct';

  @override
  String get odometerLabel => 'Current odometer reading';

  @override
  String get templatePickerTitle => 'Choose a checklist';

  @override
  String get inspectionStart => 'Start inspection';
}
