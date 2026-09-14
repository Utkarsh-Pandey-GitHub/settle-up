package expo.modules.transactionsms

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.exception.Exceptions

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
      // Only the explicitly selected dates; SMS content never goes over the network.
      context.contentResolver.query(
        Uri.parse("content://sms/inbox"), arrayOf("_id", "body", "date"),
        "date >= ? AND date < ?", arrayOf(start.toLong().toString(), end.toLong().toString()), "date DESC"
      )?.use { cursor ->
        val id = cursor.getColumnIndexOrThrow("_id")
        val body = cursor.getColumnIndexOrThrow("body")
        val date = cursor.getColumnIndexOrThrow("date")
        var scanned = 0
        val financial = Regex("debited|credited|spent|paid|received|transferred|withdrawn", RegexOption.IGNORE_CASE)
        val secret = Regex("\\b(otp|verification code|one.time.password)\\b", RegexOption.IGNORE_CASE)
        while (cursor.moveToNext()) {
          if (++scanned > 10000) throw IllegalArgumentException("Too many messages. Choose a shorter date range.")
          val message = cursor.getString(body) ?: continue
          if (financial.containsMatchIn(message) && !secret.containsMatchIn(message)) {
            results.add(mapOf("id" to cursor.getString(id), "body" to message, "timestamp" to cursor.getLong(date).toDouble()))
          }
        }
      }
      results
    }
  }
}
