import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import 'node_state.dart';

/// Lists the nodes currently marked Warning/Critical; tapping one hands the node name back to the
/// caller, which pops this sheet and calls Inspection3DScreen.focusCamera(node) -- fulfilling "select
/// a defect to focus/rotate the 3D camera to that component."
class DefectReviewSheet extends StatelessWidget {
  const DefectReviewSheet({super.key, required this.nodes, required this.resultFor, required this.onFocus});

  final List<String> nodes;
  final CheckResult Function(String node) resultFor;
  final void Function(String node) onFocus;

  String _label(String node) => node.replaceFirst(RegExp(r'^(EXT_|INT_)'), '').replaceAll('_', ' ');

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Flagged components', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            if (nodes.isEmpty) const Padding(padding: EdgeInsets.all(16), child: Text('Nothing flagged yet.')),
            for (final node in nodes)
              ListTile(
                contentPadding: EdgeInsets.zero,
                leading: Icon(
                  Icons.circle,
                  size: 14,
                  color: resultFor(node) == CheckResult.critical ? AppColors.danger : AppColors.warning,
                ),
                title: Text(_label(node)),
                trailing: const Icon(Icons.center_focus_strong, size: 18),
                onTap: () => onFocus(node),
              ),
          ],
        ),
      ),
    );
  }
}
