package expo.modules.homewidgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews

private fun quickActions(context: Context): RemoteViews {
  val views = RemoteViews(context.packageName, R.layout.widget_quick_actions)
  views.setOnClickPendingIntent(R.id.action_qr, WidgetStore.launch(context, "quick-add"))
  views.setOnClickPendingIntent(R.id.action_bill, WidgetStore.launch(context, "add?bill=camera"))
  views.setOnClickPendingIntent(R.id.action_expense, WidgetStore.launch(context, "add"))
  views.setOnClickPendingIntent(R.id.action_payment, WidgetStore.launch(context, "groups"))
  return views
}

class QuickActionsCompactWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    ids.forEach { manager.updateAppWidget(it, quickActions(context)) }
  }
}

/** A search-bar style widget that opens the AI Quick Add chat. */
class QuickAddWidget : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    ids.forEach {
      val views = RemoteViews(context.packageName, R.layout.widget_quick_add)
      val open = WidgetStore.launch(context, "quick-add")
      views.setOnClickPendingIntent(R.id.quick_add_root, open)
      views.setOnClickPendingIntent(R.id.quick_add_bar, open)
      manager.updateAppWidget(it, views)
    }
  }
}
