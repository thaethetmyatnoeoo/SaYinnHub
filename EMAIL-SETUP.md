# Registration email verification

New Owner and Member registrations require a six-digit email code. Existing accounts can still sign in. Codes expire after ten minutes, allow five guesses, and can be used once. Resending replaces the previous code and requires a 60-second wait. The public send endpoint allows ten requests per IP per hour. Codes are salted and scrypt-hashed in the additive `email_challenges` table, never logged or returned by the API.

## Configure delivery

1. Create your account at https://resend.com/ and verify your own email.
2. For a private test, Resend's `onboarding@resend.dev` sender can only deliver to the email used for your Resend account. To send registration codes to friends or customers, add a domain you own in Resend's Domains dashboard and add its required DNS records at your domain provider. Wait for the domain to be verified.
3. Create a sending API key in Resend. Save it directly in the project's ignored `.env` file (or your hosting service's secret environment settings). Do not paste it into chat, source code, or GitHub.
4. Add these values, replacing the examples:

```dotenv
RESEND_API_KEY=your_actual_resend_api_key
EMAIL_FROM="Sayinn Hub <verify@your-verified-domain.com>"
```

For the restricted self-test only, use `EMAIL_FROM="Sayinn Hub <onboarding@resend.dev>"`.

5. Restart `npm run dev`. `npm run demo` also loads `.env`, but keeps its separate demo database.
6. Open Register, enter your email, click **Send verification code**, and check your inbox/spam folder. Enter the code and complete registration. Confirm that a wrong code is rejected and that a successful registration allows login.

Without these settings the app reports that email verification is not configured and blocks new registration; it never pretends that a message was sent. Live delivery has not been verified until the sender is configured and this inbox test is complete. If account creation fails after a valid code is consumed (for example, a duplicate username), correct the form and request another code after the cooldown.

Official documentation: https://resend.com/docs/api-reference/emails/send-email and https://resend.com/docs/dashboard/domains/introduction
