import { t as tr } from "../../i18n";
import { validatePersonal } from "./validation";
import React, { useState } from "react";
import { Button, Field } from "../../components/ui";
import { ImageUpload } from "../../components/ImageUpload";
import { api } from "../../api";
export function Profile({ data, act, notify }) {
  const [image, I] = useState(data.user.image || ""),
    [busy, B] = useState(false),
    [uploading, U] = useState(false),
    [error, E] = useState("");
  async function save(e, password = false) {
    e.preventDefault();
    const form = e.currentTarget;
    const d = Object.fromEntries(new FormData(form));
    E("");
    if (password && d.password !== d.confirmPassword) {
      E("New passwords must match.");
      return;
    }
    B(true);
    try {
      validatePersonal(d, { password, phone: !password });
      if (password) {
        await api(
          "/profile/password",
          {
            currentPassword: d.currentPassword,
            password: d.password,
            confirmPassword: d.confirmPassword,
          },
          "PUT",
        );
        form.reset();
      } else await act("/profile", { ...d, image }, "PUT");
      notify(
        password
          ? "Password updated. Other sessions have been signed out."
          : "Profile saved.",
      );
    } catch (err) {
      E(err.message);
    } finally {
      B(false);
    }
  }
  return (
    <div className="account-grid">
      <section className="panel account-panel">
        <h2>{tr("Your profile")}</h2>
        <form onSubmit={save}>
          <div className="form-grid">
            <Field
              label={tr("Full name")}
              name="name"
              defaultValue={data.user.name}
              required
              maxLength={100}
            />
            <Field
              label={tr("Username")}
              name="username"
              defaultValue={data.user.username}
              autoComplete="username"
              required
            />
            <Field
              label={tr("Email")}
              name="email"
              type="email"
              defaultValue={data.user.email}
            />
            <Field
              label={tr("Phone")}
              name="phone"
              type="tel"
              defaultValue={data.user.phone}
              maxLength={40}
            />
          </div>
          <ImageUpload
            label={tr("Profile picture")}
            purpose="profile"
            value={image}
            onChange={I}
            onBusy={U}
          />
          <Button kind="primary" disabled={busy || uploading}>
            {tr("Save profile")}
          </Button>
        </form>
      </section>
      <section className="panel account-panel">
        <h2>{tr("Change password")}</h2>
        <p>
          {tr(
            "Use at least 10 characters, including a letter and a number. Other signed-in sessions will be revoked.",
          )}
        </p>
        <form onSubmit={(e) => save(e, true)}>
          <Field
            label={tr("Current password")}
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
          />
          <Field
            label={tr("New password")}
            name="password"
            type="password"
            autoComplete="new-password"
            pattern="(?=.*[A-Za-z])(?=.*[0-9]).{10,128}"
            title={tr(
              "At least 10 characters, including a letter and a number",
            )}
            required
            minLength={10}
            maxLength={128}
          />
          <Field
            label={tr("Confirm new password")}
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={10}
            maxLength={128}
          />
          <Button kind="primary" disabled={busy}>
            {tr("Update password")}
          </Button>
        </form>
      </section>
      {error && (
        <p role="alert" className="form-error">
          {tr(error)}
        </p>
      )}
    </div>
  );
}
