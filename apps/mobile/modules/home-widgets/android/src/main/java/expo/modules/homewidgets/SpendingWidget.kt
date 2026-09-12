package expo.modules.homewidgets

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Shader
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Currency
import java.util.Locale

/**
 * A 4×3 spending analytics widget.
 *
 * Reads the cached JSON snapshot from SharedPreferences (pushed by the JS
 * layer via [HomeWidgetsModule.updateSnapshot]) and renders:
 *   - Total spent this week or month
 *   - A sparkline bar graph of daily spend
 *   - Up to 2 active budget goals with progress bars
 *   - "Last synced" timestamp
 *
 * If no snapshot is available the widget shows "Open SettleUp to sync".
 */
class SpendingWidget : AppWidgetProvider() {

  override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
    val prefs = context.getSharedPreferences(HomeWidgetsModule.PREFS, Context.MODE_PRIVATE)
    val accountId = prefs.getString(HomeWidgetsModule.KEY_ACCOUNT, null)
    val raw = if (accountId != null) prefs.getString("snapshot_$accountId", null) else null

    for (id in ids) {
      val views = RemoteViews(context.packageName, R.layout.widget_spending)
      // Tapping anywhere opens the analytics screen.
      views.setOnClickPendingIntent(R.id.widget_root, deepLink(context, "settleup://analytics"))

      if (raw == null) {
        views.setTextViewText(R.id.widget_total, context.getString(R.string.widget_open))
        views.setTextViewText(R.id.widget_period, "")
        views.setImageViewBitmap(R.id.widget_graph, null)
        views.setViewVisibility(R.id.widget_goals, View.GONE)
        views.setTextViewText(R.id.widget_updated, context.getString(R.string.widget_open))
        mgr.updateAppWidget(id, views)
        continue
      }

      val snap = JSONObject(raw)
      val currency = snap.optString("currency", "INR")
      val digits = snap.optInt("digits", 2)
      val days = snap.optJSONObject("days") ?: JSONObject()
      val goals = snap.optJSONArray("goals")
      val updatedAt = snap.optLong("updatedAt", 0L)

      // Current week: Monday → Sunday.
      val cal = Calendar.getInstance()
      val dateFmt = SimpleDateFormat("yyyy-MM-dd", Locale.US)
      val labelFmt = SimpleDateFormat("MMM d", Locale.US)

      // Move to Monday of this week.
      cal.firstDayOfWeek = Calendar.MONDAY
      cal.set(Calendar.DAY_OF_WEEK, Calendar.MONDAY)
      val weekStart = cal.time

      // Collect daily totals for the 7-day week.
      val amounts = mutableListOf<Long>()
      var total = 0L
      for (i in 0 until 7) {
        if (i > 0) cal.add(Calendar.DAY_OF_MONTH, 1)
        val key = dateFmt.format(cal.time)
        val amt = days.optLong(key, 0L)
        amounts.add(amt)
        total += amt
      }
      val weekEnd = cal.time

      // Format total as currency.
      val fmt = try {
        NumberFormat.getCurrencyInstance(Locale("en", "IN")).apply {
          this.currency = Currency.getInstance(currency)
          minimumFractionDigits = if (digits == 0) 0 else digits
          maximumFractionDigits = digits
        }
      } catch (_: Exception) {
        NumberFormat.getInstance()
      }
      val divisor = Math.pow(10.0, digits.toDouble())
      views.setTextViewText(R.id.widget_total, fmt.format(total / divisor))
      views.setTextViewText(R.id.widget_period,
        "This week · ${labelFmt.format(weekStart)} – ${labelFmt.format(weekEnd)}")

      // Draw sparkline bar graph.
      views.setImageViewBitmap(R.id.widget_graph, drawSparkline(amounts, 600, 160))

      // Goals (up to 2).
      if (goals != null && goals.length() > 0) {
        views.setViewVisibility(R.id.widget_goals, View.VISIBLE)
        for (i in 0 until minOf(goals.length(), 2)) {
          val goal = goals.getJSONObject(i)
          val name = goal.optString("name", "Budget")
          val limit = goal.optLong("limit", 1L)
          val spent = goal.optLong("spent", 0L)
          val pct = if (limit > 0) ((spent * 100) / limit).toInt().coerceIn(0, 100) else 0
          val goalText = "$name · $pct%"
          when (i) {
            0 -> {
              views.setTextViewText(R.id.widget_goal_1, goalText)
              views.setProgressBar(R.id.widget_progress_1, 100, pct, false)
              views.setViewVisibility(R.id.widget_goal_1, View.VISIBLE)
              views.setViewVisibility(R.id.widget_progress_1, View.VISIBLE)
            }
            1 -> {
              views.setTextViewText(R.id.widget_goal_2, goalText)
              views.setProgressBar(R.id.widget_progress_2, 100, pct, false)
              views.setViewVisibility(R.id.widget_goal_2, View.VISIBLE)
              views.setViewVisibility(R.id.widget_progress_2, View.VISIBLE)
            }
          }
        }
        if (goals.length() < 2) {
          views.setViewVisibility(R.id.widget_goal_2, View.GONE)
          views.setViewVisibility(R.id.widget_progress_2, View.GONE)
        }
      } else {
        views.setViewVisibility(R.id.widget_goals, View.GONE)
      }

      // Last synced label.
      if (updatedAt > 0) {
        val mins = ((System.currentTimeMillis() - updatedAt) / 60_000).toInt()
        val syncText = when {
          mins < 1 -> "Synced just now"
          mins < 60 -> "Synced ${mins}m ago"
          mins < 1440 -> "Synced ${mins / 60}h ago"
          else -> "Synced ${mins / 1440}d ago"
        }
        views.setTextViewText(R.id.widget_updated, syncText)
      } else {
        views.setTextViewText(R.id.widget_updated, context.getString(R.string.widget_open))
      }

      mgr.updateAppWidget(id, views)
    }
  }

  /** Draw rounded vertical bars for each day's spend. */
  private fun drawSparkline(amounts: List<Long>, w: Int, h: Int): Bitmap {
    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bmp)
    val max = (amounts.maxOrNull() ?: 1L).coerceAtLeast(1L).toFloat()
    val barCount = amounts.size
    val spacing = 8f
    val barWidth = (w.toFloat() - spacing * (barCount + 1)) / barCount
    val cornerRadius = barWidth / 2f

    val barPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      shader = LinearGradient(
        0f, 0f, 0f, h.toFloat(),
        0xFF8770BE.toInt(), 0xFFB8A5E0.toInt(),
        Shader.TileMode.CLAMP
      )
    }

    for (i in amounts.indices) {
      val barH = (amounts[i].toFloat() / max) * (h - 12f)
      if (barH < 1f) continue  // Skip zero-spend days.
      val left = spacing + i * (barWidth + spacing)
      val top = h - barH
      val right = left + barWidth
      val bottom = h.toFloat()
      canvas.drawRoundRect(left, top, right, bottom, cornerRadius, cornerRadius, barPaint)
    }

    // Subtle baseline.
    val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = 0x20544274
      strokeWidth = 2f
    }
    canvas.drawLine(0f, h - 1f, w.toFloat(), h - 1f, linePaint)

    return bmp
  }
}
