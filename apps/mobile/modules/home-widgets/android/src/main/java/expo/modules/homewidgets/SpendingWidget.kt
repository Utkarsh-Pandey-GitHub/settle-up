package expo.modules.homewidgets

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Currency
import java.util.Date
import java.util.Locale
import kotlin.math.max
import kotlin.math.pow

class SpendingWidget : AppWidgetProvider() {
  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (intent.action == "${context.packageName}.WIDGET_PERIOD") {
      val id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
      val manager = AppWidgetManager.getInstance(context)
      if (manager.getAppWidgetInfo(id)?.provider != ComponentName(context, SpendingWidget::class.java)) return
      WidgetStore.prefs(context).edit().putBoolean("week_$id", intent.getBooleanExtra("week", false)).apply()
      onUpdate(context, manager, intArrayOf(id))
    }
  }
  override fun onDeleted(context: Context, ids: IntArray) {
    val edit = WidgetStore.prefs(context).edit()
    ids.forEach { edit.remove("week_$it") }
    edit.apply()
  }
  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) = onUpdate(context, manager, intArrayOf(id))
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    ids.forEach { id -> manager.updateAppWidget(id, render(context, id)) }
  }
  private fun toggle(context: Context, id: Int, week: Boolean): PendingIntent {
    val intent = Intent(context, SpendingWidget::class.java)
      .setAction("${context.packageName}.WIDGET_PERIOD")
      .setData(Uri.parse("settleup-widget://period/$id/$week"))
      .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id).putExtra("week", week)
    return PendingIntent.getBroadcast(context, id, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }
  private fun render(context: Context, id: Int): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.widget_spending)
    val week = WidgetStore.prefs(context).getBoolean("week_$id", false)
    val snapshot = WidgetStore.snapshot(context)
    val route = "analytics?period=${if (week) "WEEK" else "MONTH"}"
    views.setImageViewResource(R.id.widget_brand, context.applicationInfo.icon)
    views.setOnClickPendingIntent(R.id.widget_root, WidgetStore.launch(context, route))
    views.setOnClickPendingIntent(R.id.widget_goals, WidgetStore.launch(context, "goals"))
    views.setOnClickPendingIntent(R.id.widget_week, toggle(context, id, true))
    views.setOnClickPendingIntent(R.id.widget_month, toggle(context, id, false))
    views.setInt(R.id.widget_week, "setBackgroundResource", if (week) R.drawable.widget_accent else 0)
    views.setInt(R.id.widget_month, "setBackgroundResource", if (week) 0 else R.drawable.widget_accent)
    views.setContentDescription(R.id.widget_week, if (week) "Week, selected" else "Show this week")
    views.setContentDescription(R.id.widget_month, if (week) "Show this month" else "Month, selected")
    views.setViewVisibility(R.id.widget_goal_2, View.GONE)
    views.setViewVisibility(R.id.widget_progress_1, View.GONE)
    views.setViewVisibility(R.id.widget_progress_2, View.GONE)
    if (snapshot == null) {
      views.setTextViewText(R.id.widget_total, "Your spending")
      views.setTextViewText(R.id.widget_period, "Open SettleUp to load your active account")
      views.setTextViewText(R.id.widget_goal_1, "Your goals will appear here")
      views.setViewVisibility(R.id.widget_graph, View.INVISIBLE)
      return views
    }
    val dates = WidgetSeries.dates(week)
    val days = snapshot.optJSONObject("days") ?: JSONObject()
    val values = dates.map { days.optDouble(it, 0.0).coerceAtLeast(0.0) }
    val currency = snapshot.optString("currency", "INR")
    val digits = snapshot.optInt("digits", 2).coerceIn(0, 4)
    fun money(minor: Double): String = try {
      NumberFormat.getCurrencyInstance(Locale("en", "IN")).apply {
        this.currency = Currency.getInstance(currency)
        minimumFractionDigits = digits; maximumFractionDigits = digits
      }.format(minor / 10.0.pow(digits))
    } catch (_: Exception) { "$currency ${minor / 10.0.pow(digits)}" }
    views.setTextViewText(R.id.widget_title, "SettleUp · ${snapshot.optString("name", "You")}")
    views.setTextViewText(R.id.widget_total, money(values.sum()))
    views.setTextViewText(R.id.widget_period, if (week) "Spent this week · Mon–Sun" else "Spent this month · daily view")
    views.setViewVisibility(R.id.widget_graph, View.VISIBLE)
    views.setImageViewBitmap(R.id.widget_graph, graph(dates, values, week))
    views.setContentDescription(R.id.widget_graph, dates.zip(values).joinToString("; ") { "${it.first}: ${money(it.second)}" })
    val goals = snapshot.optJSONArray("goals")
    val active = (0 until (goals?.length() ?: 0)).mapNotNull { goals?.optJSONObject(it) }
      .filter { it.optLong("end") > System.currentTimeMillis() }
      .sortedBy { if (it.optString("period") == if (week) "WEEK" else "MONTH") 0 else 1 }.take(2)
    views.setTextViewText(R.id.widget_goal_1, "No active goals · tap to add one")
    active.forEachIndexed { index, goal ->
      val label = if (index == 0) R.id.widget_goal_1 else R.id.widget_goal_2
      val progress = if (index == 0) R.id.widget_progress_1 else R.id.widget_progress_2
      val spent = goal.optDouble("spent", 0.0).coerceAtLeast(0.0)
      val limit = goal.optDouble("limit", 0.0)
      val percent = if (limit > 0) (spent / limit * 100).toInt() else 0
      val text = "${goal.optString("name")} · $percent% of ${money(limit)}"
      views.setTextViewText(label, text)
      views.setContentDescription(label, "$text, ${money(spent)} spent")
      views.setViewVisibility(label, View.VISIBLE)
      views.setViewVisibility(progress, View.VISIBLE)
      views.setProgressBar(progress, 100, percent.coerceIn(0, 100), false)
    }
    val dateFormat = SimpleDateFormat("d MMM, h:mm a", Locale("en", "IN")).apply { timeZone = WidgetSeries.zone }
    views.setTextViewText(R.id.widget_updated, "Updated ${dateFormat.format(Date(snapshot.optLong("updatedAt")))} · open to refresh")
    return views
  }
  private fun graph(dates: List<String>, values: List<Double>, week: Boolean): Bitmap {
    val bitmap = Bitmap.createBitmap(640, 154, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    val peak = max(values.maxOrNull() ?: 0.0, 1.0)
    val step = 608f / values.size
    paint.color = Color.rgb(229, 223, 242); paint.strokeWidth = 1f
    canvas.drawLine(16f, 25f, 624f, 25f, paint)
    canvas.drawLine(16f, 118f, 624f, 118f, paint)
    values.forEachIndexed { index, value ->
      paint.color = Color.rgb(135, 112, 190)
      val left = 16f + index * step + step * 0.15f
      val height = (value / peak * 90).toFloat()
      if (height > 0) canvas.drawRoundRect(left, 118f - height, left + step * 0.7f, 118f, 4f, 4f, paint)
      if (week || index == 0 || index == values.size / 2 || index == values.lastIndex) {
        paint.color = Color.rgb(118, 108, 131); paint.textSize = 19f; paint.textAlign = Paint.Align.CENTER
        canvas.drawText(if (week) listOf("M", "T", "W", "T", "F", "S", "S")[index] else dates[index].takeLast(2).toInt().toString(), 16f + (index + 0.5f) * step, 148f, paint)
      }
    }
    if (values.sum() == 0.0) {
      paint.color = Color.rgb(118, 108, 131); paint.textSize = 23f; paint.textAlign = Paint.Align.CENTER
      canvas.drawText("No spending recorded yet", 320f, 80f, paint)
    }
    return bitmap
  }
}
