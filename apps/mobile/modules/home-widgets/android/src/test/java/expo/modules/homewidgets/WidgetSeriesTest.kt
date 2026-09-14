package expo.modules.homewidgets

import java.text.SimpleDateFormat
import java.util.Locale
import org.junit.Assert.assertEquals
import org.junit.Test

class WidgetSeriesTest {
  private fun date(value: String): Long = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).apply { timeZone = WidgetSeries.zone }.parse(value)!!.time
  @Test fun weekStartsOnMondayAcrossYears() {
    val days = WidgetSeries.dates(true, date("2027-01-03 12:00"))
    assertEquals("2026-12-28", days.first())
    assertEquals("2027-01-03", days.last())
    assertEquals(7, days.size)
  }
  @Test fun leapFebruaryIncludesAllDays() {
    val days = WidgetSeries.dates(false, date("2028-02-15 12:00"))
    assertEquals(29, days.size)
    assertEquals("2028-02-29", days.last())
  }
  @Test fun periodUsesIndiaMidnight() {
    val utc = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }.parse("2026-08-31 19:00")!!.time
    assertEquals("2026-09-01", WidgetSeries.dates(false, utc).first())
  }
}
