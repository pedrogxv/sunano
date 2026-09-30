# Next.js template

This is a Next.js template with shadcn/ui.

## Maintenance mode

Set `MAINTENANCE_MODE=true` (or `NEXT_PUBLIC_MAINTENANCE_MODE=true`) in your environment to enable maintenance mode.

When enabled:

- Public routes show the maintenance screen (`503`); login stays open at `/login`
- The maintenance panel lives at `/admin/maintenance`
- Non-authenticated API requests return `503`
- Logged-in admin users keep normal access

## Admin access

- `webmaster` has full access to every permission and cannot be limited by role rules.
- Regular `admin` users receive permissions through the `permissions` JSON on `admin_profiles`.
- Password changes are only available to `webmaster` accounts.
- The login screen includes a password reset action that always confirms the email was sent.

## Environment

Copy [.env.example](.env.example) and set the Supabase keys plus the SMTP placeholders used by Auth email delivery.

## Adding components

To add components to your app, run the following command:

```bash
npx shadcn@latest add button
```

This will place the ui components in the `components` directory.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button";
```
