# Registration without email confirmation

Owner and Member registration no longer sends or requires an email verification code. No email-provider account, domain, API key, or Gmail App Password is needed to register.

Email addresses are still collected and validated for format as part of the profile. This does not verify ownership of the inbox. Password and personal-information validation remain enabled. Owners can log in after registration; Members must still receive shop-owner approval.

The former `/api/v1/auth/email-code` endpoint returns HTTP 410 and does not send email. Existing accounts, shops, profiles, and database records are preserved. Historical email-challenge records are left intact but are not used during registration.
