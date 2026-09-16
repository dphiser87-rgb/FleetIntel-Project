import 'package:flutter/material.dart';
import '../../core/theme/app_theme.dart';

/// Shared status/priority color maps + money formatting for the Workshop module -- mirrors the
/// FleetHub-Workshop reference's workshop-ui.tsx tinted-pill idiom (color + alpha background,
/// solid-color text/border), just expressed with this app's existing StatusBadge widget instead of
/// a bespoke pill component.
const Map<String, Color> kJobStatusColors = {
  'pending': Color(0xFF8E8E93),
  'in_progress': Color(0xFFFFCC00),
  'on_hold': Color(0xFFA855F7),
  'completed': Color(0xFF34C759),
};
const Map<String, String> kJobStatusLabels = {
  'pending': 'Pending',
  'in_progress': 'In progress',
  'on_hold': 'On hold',
  'completed': 'Completed',
};

const Map<String, Color> kPriorityColors = {
  'low': Color(0xFF8E8E93),
  'medium': Color(0xFF3B82F6),
  'high': Color(0xFFFFCC00),
  'critical': AppColors.danger,
};

const Map<String, String> kCurrencySymbols = {
  'USD': '\$', 'ZAR': 'R', 'NGN': '₦', 'KES': 'KSh', 'GHS': 'GH₵',
  'EGP': 'E£', 'MAD': 'DH', 'TZS': 'TSh', 'UGX': 'USh', 'ETB': 'Br',
};

String formatMoney(num? amount, String currency) {
  final symbol = kCurrencySymbols[currency] ?? '$currency ';
  final v = (amount ?? 0).toDouble();
  return '$symbol${v.toStringAsFixed(2)}';
}

/// Requisition/quote/PO stage -> (label, color) shown to the driver, matching the reference's
/// per-entity status pill copy exactly.
({String label, Color color}) requisitionStatusMeta(String status) {
  switch (status) {
    case 'approved':
      return (label: 'Approved', color: kJobStatusColors['completed']!);
    case 'rejected':
      return (label: 'Rejected', color: AppColors.danger);
    default:
      return (label: 'Awaiting Workshop Manager', color: kJobStatusColors['in_progress']!);
  }
}

({String label, Color color}) quoteStatusMeta(String stage) {
  switch (stage) {
    case 'pending_ops':
      return (label: 'Awaiting Operations', color: kJobStatusColors['in_progress']!);
    case 'pending_finance':
      return (label: 'Awaiting Finance', color: kJobStatusColors['in_progress']!);
    case 'approved':
      return (label: 'Approved · PO issued', color: kJobStatusColors['completed']!);
    default:
      return (label: 'Rejected', color: AppColors.danger);
  }
}

({String label, Color color}) poStatusMeta(String status) {
  return status == 'paid'
      ? (label: 'Paid', color: kJobStatusColors['completed']!)
      : (label: 'Awaiting payment', color: const Color(0xFF3B82F6));
}
