import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { InstallAppButton } from "../components/InstallAppButton";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input, Select, TextArea } from "../components/ui/FormControls";
import { PageHeader } from "../components/ui/PageHeader";
import { api, getApiBaseUrl } from "../lib/api";
import type { BackupPayload, DeviceSession, Role, Settings, StaffUser } from "../types";

const defaultTemplate =
  "{businessName}\nOrder #{orderNumber}\n{items}\nTotal: {total}\nBalance: {balance}\nPayment: {paymentInstructions}\nThank you.";

const emptyStaffForm = {
  identifier: "",
  pin: "",
  role: "CASHIER" as Role
};

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function SettingsPage() {
  const { token, user, hasAnyRole } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [devices, setDevices] = useState<DeviceSession[]>([]);
  const [staffForm, setStaffForm] = useState(emptyStaffForm);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "ok" | "error">("idle");
  const [saving, setSaving] = useState(false);
  const [staffBusy, setStaffBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);

  const canEditSettings = hasAnyRole(["OWNER", "ADMIN", "MANAGER"]);
  const canManageStaff = hasAnyRole(["OWNER", "ADMIN"]);
  const canViewStaff = hasAnyRole(["OWNER", "ADMIN", "MANAGER"]);
  const canManageDevices = hasAnyRole(["OWNER", "ADMIN", "MANAGER"]);
  const canManageBackup = hasAnyRole(["OWNER", "ADMIN", "MANAGER"]);

  const refreshSettings = async () => {
    if (!token) return;
    const result = await api.getSettings(token);
    setSettings(result.settings);
  };

  const refreshStaff = async () => {
    if (!token || !canViewStaff) return;
    const result = await api.listStaff(token);
    setStaff(result.staff);
  };

  const refreshDevices = async () => {
    if (!token || !canManageDevices) return;
    const result = await api.listDevices(token);
    setDevices(result.devices);
  };

  const refresh = async () => {
    if (!token) return;
    setError("");
    try {
      await Promise.all([refreshSettings(), refreshStaff(), refreshDevices()]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load settings");
    }
  };

  useEffect(() => {
    void refresh();
  }, [token, user?.role]);

  const updateSettings = (updater: (prev: Settings) => Settings) => {
    setSettings((prev) => (prev ? updater(prev) : prev));
  };

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !settings || !canEditSettings) return;

    setSaving(true);
    setError("");

    try {
      const payload = {
        businessName: settings.businessName,
        currencyCode: settings.currencyCode,
        currencySymbol: settings.currencySymbol,
        paymentInstructions: settings.paymentInstructions,
        whatsappTemplate: settings.whatsappTemplate || defaultTemplate,
        supportPhone: settings.supportPhone || null,
        supportEmail: settings.supportEmail || null
      };
      const result = await api.updateSettings(token, payload);
      setSettings(result.settings);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const checkApi = async () => {
    setStatus("checking");
    try {
      await api.health;
      setStatus("ok");
    } catch {
      setStatus("error");
    }
  };

  const onCreateStaff = async (event: FormEvent) => {
    event.preventDefault();
    if (!token || !canManageStaff) return;

    setStaffBusy(true);
    setError("");
    try {
      await api.createStaff(token, staffForm);
      setStaffForm(emptyStaffForm);
      await refreshStaff();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create staff");
    } finally {
      setStaffBusy(false);
    }
  };

  const onResetPin = async (staffUser: StaffUser) => {
    if (!token || !canManageStaff) return;
    const pin = window.prompt(`Enter new PIN for ${staffUser.identifier}`, "");
    if (!pin) return;

    setStaffBusy(true);
    setError("");
    try {
      await api.resetStaffPin(token, staffUser.id, pin);
      await refreshStaff();
    } catch (pinError) {
      setError(pinError instanceof Error ? pinError.message : "Failed to reset PIN");
    } finally {
      setStaffBusy(false);
    }
  };

  const onToggleStaffActive = async (staffUser: StaffUser) => {
    if (!token || !canManageStaff) return;

    setStaffBusy(true);
    setError("");
    try {
      if (staffUser.isActive) {
        await api.deactivateStaff(token, staffUser.id);
      } else {
        await api.reactivateStaff(token, staffUser.id);
      }
      await refreshStaff();
      await refreshDevices();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Failed to update staff status");
    } finally {
      setStaffBusy(false);
    }
  };

  const onChangeRole = async (staffUser: StaffUser, role: Role) => {
    if (!token || !canManageStaff) return;

    setStaffBusy(true);
    setError("");
    try {
      await api.updateStaffRole(token, staffUser.id, role);
      await refreshStaff();
    } catch (roleError) {
      setError(roleError instanceof Error ? roleError.message : "Failed to update role");
    } finally {
      setStaffBusy(false);
    }
  };

  const onRevokeDevice = async (deviceId: string) => {
    if (!token || !canManageDevices) return;

    setError("");
    try {
      await api.revokeDevice(token, deviceId);
      await refreshDevices();
    } catch (deviceError) {
      setError(deviceError instanceof Error ? deviceError.message : "Failed to revoke device");
    }
  };

  const onExportBackup = async () => {
    if (!token || !canManageBackup) return;

    setBackupBusy(true);
    setError("");
    try {
      const backup = await api.exportBackup(token);
      downloadJson(`zimtill-backup-${new Date().toISOString().slice(0, 10)}.json`, backup);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Failed to export backup");
    } finally {
      setBackupBusy(false);
    }
  };

  const onImportBackupFile = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!token || !canManageBackup) return;
    const file = event.target.files?.[0];
    if (!file) return;

    setBackupBusy(true);
    setError("");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as BackupPayload;
      await api.importBackup(token, parsed);
      await refresh();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Failed to import backup");
    } finally {
      setBackupBusy(false);
      event.target.value = "";
    }
  };

  return (
    <section className="page-stack">
      <PageHeader
        action={
          canEditSettings ? (
            <Button disabled={saving || !settings} form="settings-form" type="submit" variant="primary">
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          ) : undefined
        }
        subtitle="Configure business details, staff access, devices, and data backups."
        title="Settings"
      />

      {error ? <p className="status-text error">{error}</p> : null}

      {!settings ? (
        <Card>
          <p className="subtle-text">Loading settings...</p>
        </Card>
      ) : (
        <form className="page-stack" id="settings-form" onSubmit={onSave}>
          <Card
            action={
              <Button onClick={() => void refresh()} variant="secondary">
                Refresh
              </Button>
            }
            subtitle="Shop identity and customer-facing payment instructions"
            title="Business"
          >
            <div className="form-grid">
              <Input
                disabled={!canEditSettings}
                label="Business Name"
                onChange={(event) => updateSettings((prev) => ({ ...prev, businessName: event.target.value }))}
                value={settings.businessName}
              />
              <TextArea
                containerClassName="span-2"
                disabled={!canEditSettings}
                label="Payment Instructions"
                onChange={(event) => updateSettings((prev) => ({ ...prev, paymentInstructions: event.target.value }))}
                rows={3}
                value={settings.paymentInstructions}
              />
            </div>
          </Card>

          <Card subtitle="Default currency in totals, reports, and order messaging" title="Currency">
            <div className="form-grid">
              <Select
                disabled={!canEditSettings}
                label="Currency Code"
                onChange={(event) => updateSettings((prev) => ({ ...prev, currencyCode: event.target.value as "USD" | "ZWL" }))}
                value={settings.currencyCode}
              >
                <option value="USD">USD</option>
                <option value="ZWL">ZWL</option>
              </Select>
              <Input
                disabled={!canEditSettings}
                label="Currency Symbol"
                onChange={(event) => updateSettings((prev) => ({ ...prev, currencySymbol: event.target.value }))}
                value={settings.currencySymbol}
              />
            </div>
          </Card>

          <Card subtitle="Template used for order sharing via WhatsApp" title="WhatsApp Template">
            <TextArea
              disabled={!canEditSettings}
              label="Template"
              onChange={(event) => updateSettings((prev) => ({ ...prev, whatsappTemplate: event.target.value }))}
              rows={6}
              value={settings.whatsappTemplate || defaultTemplate}
            />
          </Card>

          <Card subtitle="How customers can reach your shop" title="Support">
            <div className="form-grid">
              <Input
                disabled={!canEditSettings}
                label="Support Phone"
                onChange={(event) => updateSettings((prev) => ({ ...prev, supportPhone: event.target.value }))}
                value={settings.supportPhone ?? ""}
              />
              <Input
                disabled={!canEditSettings}
                label="Support Email"
                onChange={(event) => updateSettings((prev) => ({ ...prev, supportEmail: event.target.value }))}
                value={settings.supportEmail ?? ""}
              />
            </div>
            <div className="install-note">
              <InstallAppButton />
            </div>
          </Card>
        </form>
      )}

      {canViewStaff ? (
        <Card subtitle="Create staff users and assign roles" title="Staff Accounts">
          {canManageStaff ? (
            <form className="form-grid" onSubmit={onCreateStaff}>
              <Input
                label="Phone or Email"
                onChange={(event) => setStaffForm((prev) => ({ ...prev, identifier: event.target.value }))}
                required
                value={staffForm.identifier}
              />
              <Input
                label="PIN"
                maxLength={6}
                minLength={4}
                onChange={(event) => setStaffForm((prev) => ({ ...prev, pin: event.target.value }))}
                pattern="[0-9]{4,6}"
                required
                type="password"
                value={staffForm.pin}
              />
              <Select
                label="Role"
                onChange={(event) => setStaffForm((prev) => ({ ...prev, role: event.target.value as Role }))}
                value={staffForm.role}
              >
                <option value="OWNER">OWNER</option>
                <option value="ADMIN">ADMIN</option>
                <option value="MANAGER">MANAGER</option>
                <option value="CASHIER">CASHIER</option>
                <option value="STOCK_CONTROLLER">STOCK_CONTROLLER</option>
                <option value="DELIVERY_RIDER">DELIVERY_RIDER</option>
              </Select>
              <div className="actions-row">
                <Button disabled={staffBusy} type="submit" variant="primary">
                  {staffBusy ? "Saving..." : "Create Staff"}
                </Button>
              </div>
            </form>
          ) : null}

          {staff.length === 0 ? <p className="subtle-text">No staff users found.</p> : null}
          <div className="card-stack">
            {staff.map((member) => (
              <article className="list-card" key={member.id}>
                <div className="list-card-head">
                  <div>
                    <h3>{member.identifier}</h3>
                    <p className="subtle-text">
                      {member.role} • {member.isActive ? "Active" : "Inactive"}
                    </p>
                  </div>
                </div>
                <dl className="list-card-fields">
                  <div>
                    <dt>Active Devices</dt>
                    <dd>{member.activeDevices ?? 0}</dd>
                  </div>
                  <div>
                    <dt>Last Seen</dt>
                    <dd>{member.lastSeenAt ? new Date(member.lastSeenAt).toLocaleString() : "Never"}</dd>
                  </div>
                </dl>
                {canManageStaff ? (
                  <div className="list-inline-actions">
                    <Select
                      label="Role"
                      onChange={(event) => void onChangeRole(member, event.target.value as Role)}
                      value={member.role}
                    >
                      <option value="OWNER">OWNER</option>
                      <option value="ADMIN">ADMIN</option>
                      <option value="MANAGER">MANAGER</option>
                      <option value="CASHIER">CASHIER</option>
                      <option value="STOCK_CONTROLLER">STOCK_CONTROLLER</option>
                      <option value="DELIVERY_RIDER">DELIVERY_RIDER</option>
                    </Select>
                    <Button onClick={() => void onResetPin(member)} size="sm" variant="secondary">
                      Reset PIN
                    </Button>
                    <Button onClick={() => void onToggleStaffActive(member)} size="sm" variant={member.isActive ? "danger" : "primary"}>
                      {member.isActive ? "Deactivate" : "Reactivate"}
                    </Button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </Card>
      ) : null}

      {canManageDevices ? (
        <Card subtitle="All signed-in devices for your merchant" title="Device Management">
          {devices.length === 0 ? <p className="subtle-text">No devices found.</p> : null}
          <div className="card-stack">
            {devices.map((device) => (
              <article className="list-card" key={device.id}>
                <div className="list-card-head">
                  <div>
                    <h3>{device.deviceId}</h3>
                    <p className="subtle-text">
                      {device.user?.identifier ?? "Unknown user"} • {device.user?.role ?? "N/A"}
                    </p>
                  </div>
                  <span className={`status-badge ${device.revokedAt ? "status-cancelled" : "status-paid"}`}>
                    {device.revokedAt ? "Revoked" : "Active"}
                  </span>
                </div>
                <dl className="list-card-fields">
                  <div>
                    <dt>Last Seen</dt>
                    <dd>{new Date(device.lastSeenAt).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt>Updated</dt>
                    <dd>{new Date(device.updatedAt).toLocaleString()}</dd>
                  </div>
                </dl>
                {!device.revokedAt ? (
                  <div className="list-card-actions">
                    <Button onClick={() => void onRevokeDevice(device.id)} size="sm" variant="danger">
                      Revoke Device
                    </Button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </Card>
      ) : null}

      {canManageBackup ? (
        <Card subtitle="Local JSON backup and restore for merchant data" title="Backup & Restore">
          <div className="actions-row wrap">
            <Button disabled={backupBusy} onClick={() => void onExportBackup()} variant="secondary">
              Export Data (JSON)
            </Button>
            <label className="ui-button ui-button-primary" htmlFor="backup-import-input">
              Import Data (JSON)
            </label>
            <input
              accept="application/json"
              id="backup-import-input"
              onChange={(event) => void onImportBackupFile(event)}
              style={{ display: "none" }}
              type="file"
            />
          </div>
          <p className="subtle-text">Import performs a merchant-scoped merge and does not delete existing records.</p>
        </Card>
      ) : null}

      <Card subtitle="Paynow credentials remain server-side in environment variables" title="API Status">
        <p className="subtle-text">Backend URL: {getApiBaseUrl()}</p>
        <p className="subtle-text">Webhook endpoint: {getApiBaseUrl()}/payments/paynow/webhook</p>
        <div className="actions-row">
          <Button onClick={() => void checkApi()} variant="secondary">
            Check /health
          </Button>
        </div>
        {status === "checking" ? <p className="subtle-text">Checking API...</p> : null}
        {status === "ok" ? <p className="status-text success">API is reachable.</p> : null}
        {status === "error" ? <p className="status-text error">API check failed.</p> : null}
      </Card>
    </section>
  );
}
