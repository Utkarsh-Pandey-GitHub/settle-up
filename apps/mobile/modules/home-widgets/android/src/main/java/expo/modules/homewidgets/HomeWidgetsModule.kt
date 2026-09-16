package expo.modules.homewidgets

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class HomeWidgetsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("HomeWidgets")
    Function("setAccount") { id: String? ->
      appContext.reactContext?.let { WidgetStore.setAccount(it, id) }
    }
    AsyncFunction("updateSnapshot") { id: String, snapshot: String ->
      appContext.reactContext?.let { WidgetStore.save(it, id, snapshot) }
    }
    Function("copyText") { text: String ->
      val context = appContext.reactContext ?: return@Function false
      val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      clipboard.setPrimaryClip(ClipData.newPlainText("SettleUp link", text))
      true
    }
    AsyncFunction("pin") { kind: String, promise: Promise ->
      val activity = appContext.currentActivity
      val provider = WidgetStore.providers[kind]
      if (activity == null || provider == null || Build.VERSION.SDK_INT < 26) promise.resolve(false)
      else activity.runOnUiThread {
        try {
          val manager = AppWidgetManager.getInstance(activity)
          promise.resolve(manager.isRequestPinAppWidgetSupported && manager.requestPinAppWidget(ComponentName(activity, provider), null, null))
        } catch (_: Exception) { promise.resolve(false) }
      }
    }
  }
}
