package expo.modules.homewidgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews

private fun quickActions(context: Context): RemoteViews {
  val views = RemoteViews(context.packageName, R.layout.widget_quick_actions)
  views.setOnClickPendingIntent(R.id.action_qr, WidgetStore.launch(context, "scan"))
  views.setOnClickPendingIntent(R.id.action_bill, WidgetStore.launch(context, "add?bill=camera"))
  views.setOnClickPendingIntent(R.id.action_expense, WidgetStore.launch(context, "add"))
  views.setOnClickPendingIntent(R.id.action_payment, WidgetStore.launch(context, "payment-links"))
  return views
}

class QuickActionsCompactWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    ids.forEach { manager.updateAppWidget(it, quickActions(context)) }
  }
}
