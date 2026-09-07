/// Per-node inspection state, one check answer per (node, check_key). Mirrors
/// IMPLEMENTATION_NOTES.md's severity precedence: critical > warning > passed > not_checked.
enum CheckResult { notChecked, passed, warning, critical, notApplicable }

class CheckAnswer {
  CheckAnswer({this.result = CheckResult.notChecked, this.note = '', this.photoDataUrl});

  CheckResult result;
  String note;
  String? photoDataUrl;
}

/// A single node's worst-of-its-checks state, used for hotspot color and progress counting.
CheckResult worstOf(Iterable<CheckResult> results) {
  var worst = CheckResult.notChecked;
  for (final r in results) {
    if (r == CheckResult.critical) return CheckResult.critical;
    if (r == CheckResult.warning) {
      worst = CheckResult.warning;
    } else if (r == CheckResult.passed && worst == CheckResult.notChecked) {
      worst = CheckResult.passed;
    } else if (r == CheckResult.notApplicable && worst == CheckResult.notChecked) {
      worst = CheckResult.notApplicable;
    }
  }
  return worst;
}

const kNodeColors = {
  CheckResult.notChecked: '#8E8E93',
  CheckResult.passed: '#22C55E',
  CheckResult.warning: '#FDB816',
  CheckResult.critical: '#FF3D2E',
  CheckResult.notApplicable: '#4A4A4E',
};
