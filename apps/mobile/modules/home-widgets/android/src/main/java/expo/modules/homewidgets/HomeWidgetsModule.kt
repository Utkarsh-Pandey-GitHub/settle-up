package expo.modules.homewidgets

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class HomeWidgetsModule : Module() {
  private fun ctx(): Context =
    appContext.reactContext ?: throw IllegalStateException("React context unavailable")

  override fun definition() = ModuleDefinition {
    Name("HomeWidgets")

    // Store active account id so widgets know which snapshot to read.
    Function("setAccount") { id: String? ->
      ctx().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        .edit().apply {
          if (id != null) putString(KEY_ACCOUNT, id) else remove(KEY_ACCOUNT)
        }.apply()
    }

    // Push a JSON snapshot into SharedPreferences and refresh spending widgets.
    AsyncFunction("updateSnapshot") { accountId: String, snapshot: String ->
      val prefs = ctx().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      prefs.edit().putString("snapshot_$accountId", snapshot).apply()
      // Trigger a refresh on all spending widgets.
      val mgr = AppWidgetManager.getInstance(ctx())
      val ids = mgr.getAppWidgetIds(ComponentName(ctx(), SpendingWidget::class.java))
      if (ids.isNotEmpty()) {
        val intent = Intent(ctx(), SpendingWidget::class.java).apply {
          action = AppWidgetManager.ACTION_APPWIDGET_UPDATE
          putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
        }
        ctx().sendBroadcast(intent)
      }
    }

    // Request the launcher to pin a widget (Android 8+).
    AsyncFunction("pin") { kind: String ->
      val context = ctx()
      val mgr = AppWidgetManager.getInstance(context)
      if (!mgr.isRequestPinAppWidgetSupported) return@AsyncFunction false
      val component = when (kind) {
        "qr" -> ComponentName(context, ScanQrWidget::class.java)
        "transaction" -> ComponentName(context, RecordTransactionWidget::class.java)
        "bill" -> ComponentName(context, ScanBillWidget::class.java)
        "spending" -> ComponentName(context, SpendingWidget::class.java)
        else -> return@AsyncFunction false
      }
      mgr.requestPinAppWidget(component, null, null)
      true
    }
  }

  companion object {
    const val PREFS = "home_widgets"
    const val KEY_ACCOUNT = "active_account"
  }
}
