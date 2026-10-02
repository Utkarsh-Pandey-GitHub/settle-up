package expo.modules.transactionsms

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Telephony
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.exception.Exceptions
import org.json.JSONArray
import org.json.JSONObject

private val financialAction = Regex(
  "debited|spent|paid|withdrawn|purchase|sent|debit",
  RegexOption.IGNORE_CASE
)
private val incomingMoney = Regex("credited|received|deposited|money added|credit\\b", RegexOption.IGNORE_CASE)
private val moneyAmount = Regex("(?:INR|Rs\\.?|₹)\\s*[\\d,]+(?:\\.\\d{1,2})?", RegexOption.IGNORE_CASE)
private val secret = Regex("\\b(otp|verification code|one.time.password)\\b", RegexOption.IGNORE_CASE)
private fun looksFinancial(message: String) =
  financialAction.containsMatchIn(message) &&
    moneyAmount.containsMatchIn(message) &&
    !incomingMoney.containsMatchIn(message) &&
    !secret.containsMatchIn(message)

class TransactionSmsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
    if (messages.isEmpty()) return
    val body = messages.joinToString("") { it.messageBody ?: "" }
    if (!looksFinancial(body)) return
    val timestamp = messages.first().timestampMillis
    val prefs = context.getSharedPreferences("settleup_transaction_sms", Context.MODE_PRIVATE)
    val pending = try { JSONArray(prefs.getString("pending", "[]")) } catch (_: Exception) { JSONArray() }
    pending.put(
      JSONObject()
        .put("id", "received:${timestamp}:${body.hashCode()}")
        .put("body", body)
        .put("timestamp", timestamp)
    )
    while (pending.length() > 100) pending.remove(0)
    prefs.edit().putString("pending", pending.toString()).apply()
  }
}

class TransactionSmsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TransactionSms")
    // Permission is requested from the JS service only after the in-app explanation.
    AsyncFunction("readRange") { start: Double, end: Double ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
        throw SecurityException("Enable SMS review to grant permission first.")
      }
      require(start.isFinite() && end.isFinite() && start >= 0 && end > start && end <= System.currentTimeMillis() + 1000) { "Invalid SMS date range." }
      val results = mutableListOf<Map<String, Any>>()
      val seen = mutableSetOf<String>()
      // Only the explicitly selected dates; SMS content never goes over the network.
      context.contentResolver.query(
        Uri.parse("content://sms/inbox"), arrayOf("_id", "body", "date"),
        "date >= ? AND date < ?", arrayOf(start.toLong().toString(), end.toLong().toString()), "date DESC"
      )?.use { cursor ->
        val id = cursor.getColumnIndexOrThrow("_id")
        val body = cursor.getColumnIndexOrThrow("body")
        val date = cursor.getColumnIndexOrThrow("date")
        var scanned = 0
        while (cursor.moveToNext()) {
          if (++scanned > 10000) throw IllegalArgumentException("Too many messages. Choose a shorter date range.")
          val message = cursor.getString(body) ?: continue
          val timestamp = cursor.getLong(date)
          if (looksFinancial(message) && seen.add("${timestamp}:${message}")) {
            results.add(mapOf("id" to cursor.getString(id), "body" to message, "timestamp" to timestamp.toDouble()))
          }
        }
      }
      val prefs = context.getSharedPreferences("settleup_transaction_sms", Context.MODE_PRIVATE)
      val pending = try { JSONArray(prefs.getString("pending", "[]")) } catch (_: Exception) { JSONArray() }
      for (index in 0 until pending.length()) {
        val item = pending.optJSONObject(index) ?: continue
        val timestamp = item.optLong("timestamp")
        val message = item.optString("body")
        if (timestamp >= start && timestamp < end && looksFinancial(message) && seen.add("${timestamp}:${message}")) {
          results.add(mapOf("id" to item.optString("id"), "body" to message, "timestamp" to timestamp.toDouble()))
        }
      }
      prefs.edit().remove("pending").apply()
      results.sortByDescending { it["timestamp"] as Double }
      results
    }
  }
}
