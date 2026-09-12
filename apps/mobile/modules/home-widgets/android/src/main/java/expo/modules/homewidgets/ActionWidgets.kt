package expo.modules.homewidgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

/**
 * A simple 2×1 action widget that opens the app's QR scanner screen.
 */
class ScanQrWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
    for (id in ids) {
      val views = RemoteViews(context.packageName, R.layout.widget_action)
      views.setImageViewResource(R.id.widget_icon, R.drawable.widget_mascot_qr)
      views.setTextViewText(R.id.widget_title, context.getString(R.string.widget_qr_name))
      views.setTextViewText(R.id.widget_subtitle, "Tap to scan QR")
      views.setOnClickPendingIntent(R.id.widget_root, deepLink(context, "settleup://scan"))
      mgr.updateAppWidget(id, views)
    }
  }
}

/**
 * A simple 2×2 action widget that opens the add-transaction screen.
 */
class RecordTransactionWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
    for (id in ids) {
      val views = RemoteViews(context.packageName, R.layout.widget_action)
      views.setImageViewResource(R.id.widget_icon, R.drawable.widget_mascot_checklist)
      views.setTextViewText(R.id.widget_title, context.getString(R.string.widget_transaction_name))
      views.setTextViewText(R.id.widget_subtitle, "Tap to record")
      views.setOnClickPendingIntent(R.id.widget_root, deepLink(context, "settleup://add"))
      mgr.updateAppWidget(id, views)
    }
  }
}

/**
 * A simple 2×2 action widget that opens the bill scanner / camera.
 */
class ScanBillWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
    for (id in ids) {
      val views = RemoteViews(context.packageName, R.layout.widget_action)
      views.setImageViewResource(R.id.widget_icon, R.drawable.widget_mascot_bill)
      views.setTextViewText(R.id.widget_title, context.getString(R.string.widget_bill_name))
      views.setTextViewText(R.id.widget_subtitle, "Tap to scan bill")
      views.setOnClickPendingIntent(R.id.widget_root, deepLink(context, "settleup://add?bill=1"))
      mgr.updateAppWidget(id, views)
    }
  }
}

/** Build a PendingIntent that deep-links into the Expo Router app. */
internal fun deepLink(context: Context, uri: String): PendingIntent {
  val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
    setPackage(context.packageName)
    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
  }
  return PendingIntent.getActivity(
    context, uri.hashCode(), intent,
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
  )
}
