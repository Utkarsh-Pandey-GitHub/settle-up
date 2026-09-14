# Android home-screen widgets

Four separate widgets: **Scan QR**, **Record transaction**, **Scan bill**, and **Spending & goals**. Add them from Settings → Home screen widgets, or long-press the launcher → Widgets → SettleUp. Android native build required; these are not available in Expo Go, on web, or on iOS.

Uses Android AppWidgetProvider/RemoteViews, with no extra runtime library, API key, permissions, database table, or background network requests. The native module is auto-linked by Expo. Run `npm run apk:android` after native changes and install the resulting APK. The debug APK still needs Metro.

Quick actions open `/scan`, `/add`, and `/add?capture=bill`. The bill action opens the existing camera with its normal permission handling; it never captures or submits without a tap. Authentication is still required by the existing screens.

The summary has an independent Week/Month selector for each placed widget, daily spending bars, and up to two active budgets (matching the selected period first). Tapping the graph opens analytics for that period; tapping goals opens Goals. Weeks start Monday, and periods use Asia/Kolkata, matching the app. Amounts use the account currency and personal share of settled expenses.

The active account's last synced daily totals and active budget summaries are cached in private app storage, without transaction details or authentication tokens. Updates occur when dashboard data loads or refreshes, including after edits and when the app returns to the foreground. Android periodically redraws the cached summary to update date ranges. The sync timestamp remains visible: changes from other devices require reopening the app. Account changes and sign-out clear the old summary immediately; late responses for a previous account are ignored. Home-screen values are visible to anyone who can view that screen.

Based on [Android's widget APIs](https://developer.android.com/develop/ui/views/appwidgets) and [update lifecycle](https://developer.android.com/develop/ui/views/appwidgets/advanced).
