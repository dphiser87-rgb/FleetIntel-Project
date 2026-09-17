import React, { useEffect, useState } from "react";
import { api, formatApiErrorDetail } from "@/lib/api";
import { toast } from "sonner";
import { UserCircle, CurrencyCircleDollar, BellSimple, EnvelopeSimple, SpeakerHigh, IdentificationCard, Image as ImageIcon, Trash, Wrench, Clock } from "@phosphor-icons/react";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrency } from "@/lib/CurrencyContext";
import { CURRENCIES } from "@/lib/currency";

const DIGESTS = [
  { key: "weekly_digest", label: "Weekly KPI digest", defaultFrequency: "weekly", description: "KPIs, cost anomalies, pending jobs and low-stock parts.", sendEndpoint: "/workspace/send-digest" },
  { key: "health_digest", label: "Fleet health digest", defaultFrequency: "weekly", description: "A list of at-risk and watch-status vehicles with their top contributing factors.", sendEndpoint: "/workspace/send-health-digest" },
  { key: "overdue_checklists", label: "Overdue checklists alert", defaultFrequency: "daily", description: "Scheduled checklists that have gone past their configured frequency.", sendEndpoint: "/workspace/send-overdue-checklists-alert" },
  { key: "monthly_board_email", label: "Monthly board email", defaultFrequency: "monthly", description: "Month-end cost summary with top insights, sent to the board email set on the Executive Dashboard.", sendEndpoint: "/analytics/executive-dashboard/email-summary" },
  { key: "weekly_spend_digest", label: "Weekly spend digest", defaultFrequency: "weekly", description: "Every Monday: parts spend from the last 7 days, plus everything still awaiting approval.", sendEndpoint: "/workspace/send-spend-digest" },
];

const DIGEST_FREQUENCIES = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
];

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const { currency, setCurrency } = useCurrency();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [prefs, setPrefs] = useState(null);
  const [canManage, setCanManage] = useState(false);
  const [digestSending, setDigestSending] = useState(null);
  const [licenseWarningDays, setLicenseWarningDays] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [reportLogo, setReportLogo] = useState(null);
  const [logoSaving, setLogoSaving] = useState(false);
  const [costingApproverRole, setCostingApproverRole] = useState("");
  const [shiftStartHour, setShiftStartHour] = useState(null);
  const [overdueAlertEmail, setOverdueAlertEmail] = useState("");
  const [defaultDowntimeRate, setDefaultDowntimeRate] = useState(null);

  useEffect(() => {
    if (user) { setName(user.name || ""); setEmail(user.email || ""); setSoundEnabled(user.prefs?.alert_sound_enabled !== false); }
  }, [user]);

  useEffect(() => {
    api.get("/workspace").then((r) => {
      setPrefs(r.data.workspace.notification_prefs || {});
      setLicenseWarningDays(r.data.workspace.license_warning_days ?? 30);
      setReportLogo(r.data.workspace.report_logo || null);
      setCostingApproverRole(r.data.workspace.costing_approver_role || "");
      setShiftStartHour(r.data.workspace.shift_start_hour ?? 9);
      setOverdueAlertEmail(r.data.workspace.overdue_alert_email || "");
      setDefaultDowntimeRate(r.data.workspace.default_downtime_cost_per_hour ?? 0);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setCanManage(user && ["admin", "manager"].includes(user.role));
  }, [user]);

  const saveLicenseWarningDays = async (days) => {
    setLicenseWarningDays(days);
    try {
      await api.patch("/workspace", { license_warning_days: days });
    } catch (e) { toast.error("Failed to save"); }
  };

  const saveShiftStartHour = async (hour) => {
    setShiftStartHour(hour);
    try {
      await api.patch("/workspace", { shift_start_hour: hour });
    } catch (e) { toast.error("Failed to save"); }
  };

  const saveDefaultDowntimeRate = async (rate) => {
    setDefaultDowntimeRate(rate);
    try {
      await api.patch("/workspace", { default_downtime_cost_per_hour: rate });
    } catch (e) { toast.error("Failed to save"); }
  };

  const saveOverdueAlertEmail = async () => {
    try {
      await api.patch("/workspace", { overdue_alert_email: overdueAlertEmail });
      toast.success("Alert email updated");
    } catch (e) { toast.error("Failed to save"); }
  };

  const saveCostingApproverRole = async (role) => {
    const prev = costingApproverRole;
    setCostingApproverRole(role);
    try {
      await api.patch("/workspace", { costing_approver_role: role });
      toast.success(role ? "Costing approver updated" : "Costing approver override cleared");
    } catch (e) {
      toast.error("Failed to save — reverting");
      setCostingApproverRole(prev);
    }
  };

  const uploadLogo = (file) => {
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image file"); return; }
    const r = new FileReader();
    r.onloadend = async () => {
      setLogoSaving(true);
      setReportLogo(r.result);
      try {
        await api.patch("/workspace", { report_logo: r.result });
        toast.success("Report logo updated");
      } catch (e) {
        toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to save logo");
      } finally { setLogoSaving(false); }
    };
    r.readAsDataURL(file);
  };

  const removeLogo = async () => {
    setReportLogo(null);
    try {
      await api.patch("/workspace", { report_logo: "" });
      toast.success("Report logo removed");
    } catch (e) { toast.error("Failed to remove logo"); }
  };

  const toggleSound = async () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    try {
      await api.put("/users/me/prefs", { alert_sound_enabled: next });
    } catch (e) { toast.error("Failed to save"); setSoundEnabled(!next); }
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setProfileSaving(true);
    try {
      await api.patch("/users/me", { name, email });
      await refreshUser();
      toast.success("Profile updated");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to update profile");
    } finally { setProfileSaving(false); }
  };

  const toggleDigest = async (key) => {
    const next = { ...prefs, [key]: !(prefs?.[key] !== false) };
    setPrefs(next);
    try {
      await api.patch("/workspace", { notification_prefs: { [key]: next[key] } });
    } catch (e) {
      toast.error("Failed to save — reverting");
      setPrefs(prefs);
    }
  };

  const saveDigestFrequency = async (key, frequency) => {
    const prev = prefs;
    const field = `${key}_frequency`;
    setPrefs({ ...prefs, [field]: frequency });
    try {
      await api.patch("/workspace", { notification_prefs: { [field]: frequency } });
    } catch (e) {
      toast.error("Failed to save — reverting");
      setPrefs(prev);
    }
  };

  const sendDigestNow = async (d) => {
    setDigestSending(d.key);
    try {
      const { data } = await api.post(d.sendEndpoint);
      if (data.sent) toast.success(`${d.label} sent`);
      else toast.error("No recipient configured or send failed");
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || "Failed to send");
    } finally { setDigestSending(null); }
  };

  return (
    <div className="noise-bg min-h-screen">
      <header className="border-b border-border px-8 py-6">
        <div className="overline">Account</div>
        <h1 className="font-display font-black text-4xl tracking-tight mt-1" data-testid="settings-title">Account Settings</h1>
      </header>

      <div className="p-8 max-w-5xl space-y-8">
        <div>
          <div className="overline mb-3">Personal</div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-[#121214] border border-border p-6" data-testid="profile-card">
              <div className="flex items-center gap-3 mb-1">
                <UserCircle size={22} className="text-primary" />
                <div className="overline">Your profile</div>
              </div>
              <h3 className="font-display text-2xl font-bold tracking-tight">Name & email</h3>
              <form onSubmit={saveProfile} className="mt-4 space-y-3">
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground">Name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} required data-testid="profile-name"
                    className="w-full mt-1 bg-[#0b0b0d] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="profile-email"
                    className="w-full mt-1 bg-[#0b0b0d] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
                  <div className="text-xs text-muted-foreground mt-1">Changing this changes the email you sign in with.</div>
                </div>
                <button type="submit" disabled={profileSaving} data-testid="save-profile"
                  className="bg-primary text-primary-foreground px-4 py-2.5 text-xs uppercase tracking-widest hover:bg-primary/90 disabled:opacity-60">
                  {profileSaving ? "Saving…" : "Save profile"}
                </button>
              </form>
            </div>

            <div className="bg-[#121214] border border-border p-6" data-testid="sound-card">
              <div className="flex items-center gap-3 mb-1">
                <SpeakerHigh size={22} className="text-primary" />
                <div className="overline">New notifications</div>
              </div>
              <h3 className="font-display text-2xl font-bold tracking-tight">Alert sound</h3>
              <div className="mt-2 text-sm text-muted-foreground">
                Plays a sound when a new live alert arrives. Same as the mute button in the top alert bar.
              </div>
              <button
                type="button"
                onClick={toggleSound}
                data-testid="toggle-sound-settings"
                className="mt-4 flex items-center gap-3"
              >
                <span className={`shrink-0 w-11 h-6 rounded-full border transition-colors relative ${soundEnabled ? "bg-primary border-primary" : "bg-[#0b0b0d] border-border"}`}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${soundEnabled ? "translate-x-[22px]" : "translate-x-0"}`} />
                </span>
                <span className="text-sm">{soundEnabled ? "On" : "Off"}</span>
              </button>
            </div>
          </div>
        </div>

        <div>
          <div className="overline mb-3">Workspace</div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-[#121214] border border-border p-6" data-testid="currency-card">
              <div className="flex items-center gap-3 mb-1">
                <CurrencyCircleDollar size={22} className="text-primary" />
                <div className="overline">Display</div>
              </div>
              <h3 className="font-display text-2xl font-bold tracking-tight">Currency</h3>
              <div className="mt-2 text-sm text-muted-foreground">
                Applies workspace-wide — every teammate sees costs in this currency.
                {!canManage && " Only admins and managers can change it."}
              </div>
              <select
                value={currency}
                disabled={!canManage}
                onChange={(e) => { setCurrency(e.target.value); toast.success(`Currency set to ${e.target.value}`); }}
                data-testid="currency-select"
                className="mt-4 w-full bg-[#0b0b0d] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
              >
                {Object.entries(CURRENCIES).map(([code, c]) => (
                  <option key={code} value={code}>{code} — {c.label} ({c.symbol})</option>
                ))}
              </select>
            </div>

            <div className="bg-[#121214] border border-border p-6" data-testid="default-downtime-rate-card">
              <div className="flex items-center gap-3 mb-1">
                <CurrencyCircleDollar size={22} className="text-primary" />
                <div className="overline">Costing</div>
              </div>
              <h3 className="font-display text-2xl font-bold tracking-tight">Default downtime cost / hour</h3>
              <div className="mt-2 text-sm text-muted-foreground">
                Used for any vehicle that doesn't have its own downtime cost set (Fleet → vehicle →
                Downtime cost/hour) — so fleet cost and downtime-cost figures aren't {CURRENCIES[currency]?.symbol ?? "$"}0 by default.
                {!canManage && " Only admins and managers can change it."}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <span className="text-sm text-muted-foreground">{CURRENCIES[currency]?.symbol ?? "$"}</span>
                <input
                  type="number" min="0" step="0.01"
                  value={defaultDowntimeRate ?? ""}
                  disabled={!canManage || defaultDowntimeRate === null}
                  data-testid="default-downtime-rate-input"
                  onChange={(e) => saveDefaultDowntimeRate(Math.max(0, Number(e.target.value) || 0))}
                  className="w-28 bg-[#0b0b0d] border border-border px-3 py-2.5 text-sm mono focus:border-primary focus:outline-none disabled:opacity-50"
                />
                <span className="text-sm text-muted-foreground">per hour</span>
              </div>
            </div>

            <div className="bg-[#121214] border border-border p-6" data-testid="license-warning-card">
              <div className="flex items-center gap-3 mb-1">
                <IdentificationCard size={22} className="text-primary" />
                <div className="overline">Drivers</div>
              </div>
              <h3 className="font-display text-2xl font-bold tracking-tight">License expiry warning</h3>
              <div className="mt-2 text-sm text-muted-foreground">
                How many days before a driver's license expires it shows up in Live Alerts and dents that vehicle's health score.
                {!canManage && " Only admins and managers can change it."}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <input
                  type="number" min="1"
                  value={licenseWarningDays ?? ""}
                  disabled={!canManage || licenseWarningDays === null}
                  data-testid="license-warning-days-input"
                  onChange={(e) => saveLicenseWarningDays(Number(e.target.value) || 30)}
                  className="w-20 bg-[#0b0b0d] border border-border px-3 py-2.5 text-sm mono focus:border-primary focus:outline-none disabled:opacity-50"
                />
                <span className="text-sm text-muted-foreground">days</span>
              </div>
            </div>

            <div className="bg-[#121214] border border-border p-6" data-testid="shift-cutoff-card">
              <div className="flex items-center gap-3 mb-1">
                <Clock size={22} className="text-primary" />
                <div className="overline">Mobile driver app</div>
              </div>
              <h3 className="font-display text-2xl font-bold tracking-tight">Shift check cutoff</h3>
              <div className="mt-2 text-sm text-muted-foreground">
                A driver's pre-trip check is flagged overdue in the mobile app if it isn't done by this
                time, and the address below is emailed when that happens.
                {!canManage && " Only admins and managers can change it."}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <input
                  type="number" min="0" max="23"
                  value={shiftStartHour ?? ""}
                  disabled={!canManage || shiftStartHour === null}
                  data-testid="shift-start-hour-input"
                  onChange={(e) => saveShiftStartHour(Math.max(0, Math.min(23, Number(e.target.value) || 0)))}
                  className="w-20 bg-[#0b0b0d] border border-border px-3 py-2.5 text-sm mono focus:border-primary focus:outline-none disabled:opacity-50"
                />
                <span className="text-sm text-muted-foreground">:00 (24h)</span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="email"
                  placeholder="ops@fleetintel.africa"
                  value={overdueAlertEmail}
                  disabled={!canManage}
                  data-testid="overdue-alert-email-input"
                  onChange={(e) => setOverdueAlertEmail(e.target.value)}
                  onBlur={saveOverdueAlertEmail}
                  className="flex-1 bg-[#0b0b0d] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
                />
              </div>
            </div>

            <div className="bg-[#121214] border border-border p-6" data-testid="costing-approver-card">
              <div className="flex items-center gap-3 mb-1">
                <Wrench size={22} className="text-primary" />
                <div className="overline">Job costing</div>
              </div>
              <h3 className="font-display text-2xl font-bold tracking-tight">Costing approver</h3>
              <div className="mt-2 text-sm text-muted-foreground">
                If this workspace has no dedicated Workshop Manager, let this role submit and manage job
                costing (quotes) instead — applies to everyone in that role now, and automatically to
                anyone invited into it later.
                {!canManage && " Only admins and managers can change it."}
              </div>
              <select
                value={costingApproverRole}
                disabled={!canManage}
                onChange={(e) => saveCostingApproverRole(e.target.value)}
                data-testid="costing-approver-role-select"
                className="mt-4 w-full bg-[#0b0b0d] border border-border px-3 py-2.5 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
              >
                <option value="">No override — Workshop Manager only</option>
                <option value="operations_manager">Operations Manager</option>
                <option value="finance">Finance</option>
                <option value="workshop_manager">Workshop Manager</option>
              </select>
            </div>

            <div className="bg-[#121214] border border-border p-6" data-testid="report-logo-card">
              <div className="flex items-center gap-3 mb-1">
                <ImageIcon size={22} className="text-primary" />
                <div className="overline">Reports</div>
              </div>
              <h3 className="font-display text-2xl font-bold tracking-tight">Report logo</h3>
              <div className="mt-2 text-sm text-muted-foreground">
                Shown at the top of every PDF report generated from the Report Center.
                {!canManage && " Only admins and managers can change it."}
              </div>
              <div className="mt-4 flex items-center gap-4">
                <div className="w-20 h-20 shrink-0 border border-border bg-[#0b0b0d] flex items-center justify-center overflow-hidden">
                  {reportLogo ? (
                    <img src={reportLogo} alt="Report logo" className="max-w-full max-h-full object-contain" data-testid="report-logo-preview" />
                  ) : (
                    <ImageIcon size={24} className="text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <label className={`text-xs uppercase tracking-widest px-3 py-2 border text-center cursor-pointer ${canManage ? "border-border hover:border-primary hover:text-primary" : "border-border/50 text-muted-foreground cursor-not-allowed"}`}>
                    {logoSaving ? "Uploading…" : reportLogo ? "Replace" : "Upload"}
                    <input type="file" accept="image/*" className="hidden" disabled={!canManage || logoSaving} data-testid="report-logo-input"
                      onChange={(e) => e.target.files[0] && uploadLogo(e.target.files[0])} />
                  </label>
                  {reportLogo && canManage && (
                    <button onClick={removeLogo} data-testid="remove-report-logo" className="flex items-center justify-center gap-1 text-xs uppercase tracking-widest text-muted-foreground hover:text-[#FF3B30]">
                      <Trash size={12} /> Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-[#121214] border border-border p-6 lg:col-span-2" data-testid="notifications-card">
              <div className="flex items-center gap-3 mb-1">
                <BellSimple size={22} className="text-primary" />
                <div className="overline">Automated reports</div>
              </div>
              <h3 className="font-display text-2xl font-bold tracking-tight">Notification preferences</h3>
              <div className="mt-2 text-sm text-muted-foreground">
                Controls whether each automated email sends at all, and how often. Checked daily.
                Recipient is the workspace owner, except the monthly board email which goes to the
                board email address set on the Executive Dashboard.
                {!canManage && " Only admins and managers can change these."}
              </div>
              <div className="mt-4 divide-y divide-border/50">
                {DIGESTS.map((d) => {
                  const on = prefs ? prefs[d.key] !== false : true;
                  const sending = digestSending === d.key;
                  return (
                    <div key={d.key} className="flex items-center justify-between py-3 gap-4" data-testid={`digest-toggle-${d.key}`}>
                      <div className="pr-4">
                        <div className="text-sm">{d.label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{d.description}</div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {on && (
                          <select
                            value={prefs?.[`${d.key}_frequency`] || d.defaultFrequency}
                            disabled={!canManage || prefs === null}
                            onChange={(e) => saveDigestFrequency(d.key, e.target.value)}
                            data-testid={`digest-frequency-${d.key}`}
                            className="bg-[#0b0b0d] border border-border text-xs px-2 py-1.5 disabled:opacity-50"
                          >
                            {DIGEST_FREQUENCIES.map((f) => (
                              <option key={f.value} value={f.value}>{f.label}</option>
                            ))}
                          </select>
                        )}
                        <button
                          type="button"
                          disabled={sending || digestSending !== null}
                          onClick={() => sendDigestNow(d)}
                          title="Send now"
                          data-testid={`send-digest-${d.key}`}
                          className="p-1.5 border border-border text-muted-foreground hover:text-primary hover:border-primary disabled:opacity-50"
                        >
                          <EnvelopeSimple size={14} />
                        </button>
                        <button
                          type="button"
                          disabled={!canManage || prefs === null}
                          onClick={() => toggleDigest(d.key)}
                          className={`shrink-0 w-11 h-6 rounded-full border transition-colors relative disabled:opacity-50 ${on ? "bg-primary border-primary" : "bg-[#0b0b0d] border-border"}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${on ? "translate-x-[22px]" : "translate-x-0"}`} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="text-xs text-muted-foreground mt-4 border-t border-border pt-4">
                Use the envelope icon to send any of these immediately, regardless of the toggle/schedule above.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
