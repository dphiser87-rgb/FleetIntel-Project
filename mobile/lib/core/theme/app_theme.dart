import 'package:flutter/material.dart';

/// Design tokens ported 1:1 from the web app's production theme (NOT the marketing
/// site's rounded/glassmorphism look) -- see design_guidelines discussion: dark ground,
/// sharp ~2px radius, green accent.
class AppColors {
  AppColors._();

  // Exact values pulled from frontend/src/index.css's :root HSL vars -- kept pixel-accurate to the
  // web app rather than approximated, since Phase 1 mockups get compared against it directly.
  static const background = Color(0xFF080809); // hsl(240 6% 4%), matches the CSS's explicit override
  static const surface = Color(0xFF131315); // --card: hsl(240 5% 8%)
  static const surfaceElevated = Color(0xFF1D1D20); // --secondary/--muted/--accent: hsl(240 4% 12%)
  static const border = Color(0xFF27272A); // --border: hsl(240 4% 16%)
  static const primary = Color(0xFF22C55E); // --primary: hsl(142 71% 45%)
  static const primaryInk = Color(0xFF080809); // --primary-foreground: same as background
  static const ink = Color(0xFFFFFFFF); // --foreground: 0 0% 100%
  static const muted = Color(0xFFA3A3AD); // --muted-foreground: hsl(240 5% 65%)
  static const danger = Color(0xFFFF3D2E); // --destructive: hsl(4 100% 59%)
  static const warning = Color(0xFFFDB816); // --chart-3: hsl(45 100% 51%)
}

class AppRadius {
  AppRadius._();

  static const sharp = 2.0; // 0.125rem
  static final card = BorderRadius.circular(sharp);
  static final control = BorderRadius.circular(sharp);
}

class AppTheme {
  AppTheme._();

  static ThemeData get dark {
    final base = ThemeData.dark(useMaterial3: true);
    return base.copyWith(
      scaffoldBackgroundColor: AppColors.background,
      colorScheme: base.colorScheme.copyWith(
        brightness: Brightness.dark,
        surface: AppColors.background,
        primary: AppColors.primary,
        onPrimary: AppColors.primaryInk,
        error: AppColors.danger,
      ),
      textTheme: base.textTheme.apply(
        bodyColor: AppColors.ink,
        displayColor: AppColors.ink,
      ).copyWith(
        displayLarge: const TextStyle(fontFamily: 'Outfit', fontWeight: FontWeight.w600),
        displayMedium: const TextStyle(fontFamily: 'Outfit', fontWeight: FontWeight.w600),
        headlineLarge: const TextStyle(fontFamily: 'Outfit', fontWeight: FontWeight.w600),
        headlineMedium: const TextStyle(fontFamily: 'Outfit', fontWeight: FontWeight.w600),
        headlineSmall: const TextStyle(fontFamily: 'Outfit', fontWeight: FontWeight.w600),
        titleLarge: const TextStyle(fontFamily: 'Outfit', fontWeight: FontWeight.w600),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.background,
        foregroundColor: AppColors.ink,
        elevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardThemeData(
        color: AppColors.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: AppRadius.card,
          side: const BorderSide(color: AppColors.border),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface,
        border: OutlineInputBorder(
          borderRadius: AppRadius.control,
          borderSide: const BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: AppRadius.control,
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: AppRadius.control,
          borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: AppRadius.control,
          borderSide: const BorderSide(color: AppColors.danger),
        ),
        labelStyle: const TextStyle(color: AppColors.muted),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: AppColors.primaryInk,
          shape: RoundedRectangleBorder(borderRadius: AppRadius.control),
          padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 24),
          textStyle: const TextStyle(fontFamily: 'Outfit', fontWeight: FontWeight.w600, fontSize: 16),
        ),
      ),
      dividerTheme: const DividerThemeData(color: AppColors.border, thickness: 1),
    );
  }
}
