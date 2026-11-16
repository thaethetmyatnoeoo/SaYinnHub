import { t as tr, LanguageSwitcher } from "../../i18n";
import { validatePersonal } from "./validation";
import React, { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";
import { api } from "../../api";
import { Brand, Button, Field } from "../../components/ui";
export function Auth({ done, status, register, back, shopCode, login }) {
  const [role, setRole] = useState("OWNER"),
    [success, setSuccess] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      if (register) {
        validatePersonal(data, { password: true, phone: true });
        if (data.password !== data.confirmPassword)
          throw new Error("Passwords must match.");
        const result = await api("/auth/register", { ...data, role });
        setSuccess(result);
        return;
      }
      await api("/auth/login", {
        username: data.username,
        password: data.password,
        shopCode: data.shopCode,
      });
      done();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function demoLogin() {
    setBusy(true);
    try {
      await api("/auth/login", {
        username: "owner",
        password: "Owner123!",
        shopCode: "main",
      });
      done();
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  }
  return (
    <main className={"auth" + (register ? " auth-register" : "")}>
      <div className="auth-story">
        <Brand />
        <div className="auth-copy">
          <span className="eyebrow">
            {tr("A LITTLE LESS BUSY. A LOT MORE POSSIBLE.")}
          </span>
          <h1>
            {tr("Your shop. ")}
            <br />
            {tr("In a good place.")}
          </h1>
          <p>
            {tr("From the first sale to the last little detail.")}
            <br />
            {tr("One thoughtful workspace for your everyday retail.")}
          </p>
          <div className="auth-art">
            <div className="art-circle" />
            <img src="/serum.webp" alt={tr("Hydrating serum")} />
            <img src="/lipstick.webp" alt={tr("Velvet lipstick")} />
            <img src="/cream-coral.webp" alt={tr("Moisturizer")} />
            <span className="art-note">
              <CheckCircle2 size={18} />
              {tr(" Everything, beautifully in sync.")}
            </span>
          </div>
        </div>
        <small>{tr("Made for the way you work.")}</small>
      </div>
      <section className="auth-form">
        <LanguageSwitcher />
        <div>
          <span className="eyebrow">{tr("WELCOME TO SAYINN HUB")}</span>
          <h2>
            {register
              ? tr("Your next chapter starts here.")
              : tr("Good to have you back.")}
          </h2>
          <p>
            {register
              ? tr(
                  "Start with your own shop or join a team. You can create and join more shops after signing in.",
                )
              : tr("Sign in and pick up where you left off.")}
          </p>
          <Button onClick={back}>{tr("Back to home")}</Button>
          {success ? (
            <div className="registration-success" role="status">
              <CheckCircle2 size={32} />
              <h3>
                {success.pending
                  ? tr("Your request has been sent.")
                  : tr("Your shop is ready.")}
              </h3>
              <p>
                {success.pending
                  ? tr(
                      "Your shop owner must approve your member account in Team before you can sign in.",
                    )
                  : tr(
                      "Your owner account and separate shop have been created. Keep this code for signing in and inviting your team.",
                    )}
              </p>
              <p>
                {tr("Shop code: ")}
                <strong>{success.shopCode}</strong>
              </p>
              <Button kind="primary" onClick={() => login(success.shopCode)}>
                {tr("Go to Login ")}
                <ArrowRight size={17} />
              </Button>
            </div>
          ) : (
            <form onSubmit={submit}>
              {register && (
                <>
                  <fieldset className="registration-roles">
                    <legend>{tr("How will you use SaYinn Hub?")}</legend>
                    <label className={role === "OWNER" ? "selected" : ""}>
                      <input
                        type="radio"
                        name="role"
                        value="OWNER"
                        checked={role === "OWNER"}
                        onChange={() => setRole("OWNER")}
                      />
                      <strong>{tr("Owner")}</strong>
                      <span>{tr("Create and manage your own shop.")}</span>
                    </label>
                    <label className={role === "MEMBER" ? "selected" : ""}>
                      <input
                        type="radio"
                        name="role"
                        value="MEMBER"
                        checked={role === "MEMBER"}
                        onChange={() => setRole("MEMBER")}
                      />
                      <strong>{tr("Member")}</strong>
                      <span>{tr("Join a shop and work with its team.")}</span>
                    </label>
                  </fieldset>
                  <h3 className="registration-section">
                    {tr("Your personal information")}
                  </h3>
                  <Field
                    label={tr("Full name")}
                    name="name"
                    autoComplete="name"
                    minLength={2}
                    maxLength={100}
                    required
                  />
                  <div className="form-grid">
                    <Field
                      label={tr("Email address")}
                      name="email"
                      type="email"
                      autoComplete="email"
                      maxLength={254}
                      required
                    />
                    <Field
                      label={tr("Phone number")}
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      minLength={5}
                      maxLength={40}
                      required
                    />
                  </div>
                  <h3 className="registration-section">
                    {role === "OWNER"
                      ? tr("Your new shop")
                      : tr("Join your shop")}
                  </h3>
                  {role === "OWNER" && (
                    <Field
                      label={tr("Shop name")}
                      name="storeName"
                      placeholder={tr("Your lovely shop")}
                      maxLength={150}
                      required
                    />
                  )}
                </>
              )}
              {(!register || role === "MEMBER") && (
                <Field
                  label={tr("Shop code")}
                  name="shopCode"
                  placeholder={
                    register && role === "OWNER"
                      ? tr("e.g. yaya-beauty")
                      : tr("Enter your shop code")
                  }
                  defaultValue={register ? "" : shopCode}
                  required
                  minLength={3}
                  maxLength={40}
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                />
              )}
              <p className="registration-hint">
                {register
                  ? role === "OWNER"
                    ? tr(
                        "A secure shop code is generated automatically. Keep it for signing in and inviting your team.",
                      )
                    : tr(
                        "Ask your owner for this code. Members get cashier access only after the owner approves their request.",
                      )
                  : tr(
                      "Use main for the original workspace, or the code created during registration.",
                    )}
              </p>
              {register && (
                <h3 className="registration-section">
                  {tr("Secure your account")}
                </h3>
              )}
              <Field
                label={tr("Username")}
                name="username"
                autoComplete="username"
                minLength={register ? 3 : 1}
                maxLength={register ? 60 : 150}
                pattern={register ? "[a-zA-Z0-9_.\\-]+" : undefined}
                placeholder={tr("Enter your username")}
                required
              />
              <Field
                label={tr("Password")}
                name="password"
                autoComplete={register ? "new-password" : "current-password"}
                type="password"
                maxLength={128}
                minLength={register ? 10 : 1}
                placeholder={
                  register
                    ? tr("At least 10 characters")
                    : tr("Enter your password")
                }
                required
              />
              {register && (
                <Field
                  label={tr("Confirm password")}
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  pattern="(?=.*[A-Za-z])(?=.*[0-9]).{10,128}"
                  title={tr(
                    "At least 10 characters, including a letter and a number",
                  )}
                  minLength={10}
                  maxLength={128}
                  required
                />
              )}
              {error && (
                <p className="form-error" role="alert">
                  {tr(error)}
                </p>
              )}
              <Button kind="primary" disabled={busy}>
                {busy
                  ? tr("Just a moment…")
                  : register
                    ? role === "OWNER"
                      ? tr("Create my shop")
                      : tr("Request to join shop")
                    : tr("Sign in")}
                <ArrowRight size={17} />
              </Button>
            </form>
          )}
          <p className="auth-switch">
            {register ? (
              <>
                {tr("Already have an account? ")}
                <a href="#Login">{tr("Login")}</a>
              </>
            ) : (
              <>
                {tr("New to SaYinn Hub? ")}
                <a href="#Register">{tr("Register")}</a>
              </>
            )}
          </p>
          {status.demo && !register && (
            <>
              <div className="divider">{tr("or explore first")}</div>
              <Button className="full" onClick={demoLogin} disabled={busy}>
                {tr("Open sample workspace ")}
                <ArrowUpRight size={16} />
              </Button>
              <small className="muted demo-note">
                {tr("Sample shop · No real payments")}
              </small>
            </>
          )}
          <div className="secure-note">
            <ShieldCheck size={15} />
            {tr(" Your shop’s data stays in your workspace.")}
          </div>
        </div>
      </section>
    </main>
  );
}
