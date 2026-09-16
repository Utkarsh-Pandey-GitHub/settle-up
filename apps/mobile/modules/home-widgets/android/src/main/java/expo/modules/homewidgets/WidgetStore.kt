package expo.modules.homewidgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

object WidgetSeries {
  val zone: TimeZone get() = TimeZone.getTimeZone("Asia/Kolkata")
  fun dates(week: Boolean, now: Long = System.currentTimeMillis()): List<String> {
    val calendar = Calendar.getInstance(zone).apply { timeInMillis = now }
    if (week) calendar.add(Calendar.DATE, -((calendar.get(Calendar.DAY_OF_WEEK) + 5) % 7))
    else calendar.set(Calendar.DAY_OF_MONTH, 1)
    val count = if (week) 7 else calendar.getActualMaximum(Calendar.DAY_OF_MONTH)
    val format = SimpleDateFormat("yyyy-MM-dd", Locale.US).apply { timeZone = zone }
    return (0 until count).map { format.format(calendar.time).also { calendar.add(Calendar.DATE, 1) } }
  }
}

object WidgetStore {
  val providers = mapOf(
    "quick-wide" to QuickActionsWideWidget::class.java,
    "quick-compact" to QuickActionsCompactWidget::class.java,
    "spending" to SpendingWidget::class.java
  )
  private val lock = Any()
  fun prefs(context: Context) = context.getSharedPreferences("settleup_widgets", Context.MODE_PRIVATE)
  fun setAccount(context: Context, id: String?) = synchronized(lock) {
    val prefs = prefs(context)
    if (prefs.getString("account", null) != id) {
      prefs.edit().putString("account", id).remove("snapshot").apply()
      updateAll(context)
    }
  }
  fun save(context: Context, id: String, snapshot: String) = synchronized(lock) {
    // An old account's in-flight request must never repopulate another account's widgets.
    if (prefs(context).getString("account", null) == id) {
      require(snapshot.length <= 262144) { "Widget snapshot is too large" }
      JSONObject(snapshot)
      prefs(context).edit().putString("snapshot", snapshot).apply()
      updateAll(context)
    }
  }
  fun snapshot(context: Context): JSONObject? = try {
    if (prefs(context).getString("account", null) == null) null
    else prefs(context).getString("snapshot", null)?.let { JSONObject(it) }
  } catch (_: Exception) { null }
  fun updateAll(context: Context) {
    val manager = AppWidgetManager.getInstance(context)
    providers.values.forEach { provider ->
      val ids = manager.getAppWidgetIds(ComponentName(context, provider))
      if (ids.isNotEmpty()) provider.getDeclaredConstructor().newInstance().onUpdate(context, manager, ids)
    }
  }
  fun launch(context: Context, route: String): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("settleup:///$route"))
      .setClassName(context.packageName, "${context.packageName}.MainActivity")
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    return PendingIntent.getActivity(context, route.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }
}
