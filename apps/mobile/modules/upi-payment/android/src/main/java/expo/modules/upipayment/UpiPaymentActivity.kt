package expo.modules.upipayment

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import expo.modules.kotlin.Promise
import java.util.Locale

class UpiPaymentActivity : ComponentActivity() {
  companion object {
    const val EXTRA_URI = "upi_uri"
    var pending: Promise? = null
  }

  private var launched = false
  private val launcher = registerForActivityResult(
    ActivityResultContracts.StartActivityForResult()
  ) { result ->
    finishWithResult(result.resultCode, result.data)
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (savedInstanceState != null || pending == null) {
      finish()
      return
    }
    val value = intent.getStringExtra(EXTRA_URI)
    val uri = runCatching { Uri.parse(value) }.getOrNull()
    if (uri?.scheme != "upi" || uri.host != "pay") {
      fail("UPI_INVALID", "Use a valid UPI payment link.")
      return
    }
    val paymentIntent = Intent(Intent.ACTION_VIEW, uri)
    if (paymentIntent.resolveActivity(packageManager) == null) {
      fail("UPI_UNAVAILABLE", "No UPI payment app is available on this phone.")
      return
    }
    launched = true
    launcher.launch(Intent.createChooser(paymentIntent, "Pay with UPI"))
  }

  private fun finishWithResult(resultCode: Int, data: Intent?) {
    val raw = sequenceOf(
      data?.getStringExtra("response"),
      data?.dataString,
      data?.extras?.keySet()?.joinToString("&") { key ->
        "$key=${data.extras?.get(key)}"
      }
    ).firstOrNull { !it.isNullOrBlank() }.orEmpty()
    val fields = raw
      .removePrefix("?")
      .split("&")
      .mapNotNull { part ->
        val pieces = part.split("=", limit = 2)
        if (pieces.size == 2) pieces[0].lowercase(Locale.ROOT) to pieces[1] else null
      }
      .toMap()
    val reported = fields["status"]?.uppercase(Locale.ROOT)
    val status = when {
      reported == "SUCCESS" -> "SUCCESS"
      reported == "SUBMITTED" -> "SUBMITTED"
      reported in setOf("FAILURE", "FAILED") -> "FAILURE"
      resultCode == Activity.RESULT_CANCELED && raw.isBlank() -> "CANCELLED"
      else -> "UNKNOWN"
    }
    val transactionId = fields["txnid"] ?: fields["txnref"] ?: fields["approvalrefno"]
    val promise = pending
    pending = null
    promise?.resolve(
      mapOf(
        "status" to status,
        "transactionId" to transactionId,
        "response" to raw.take(1000)
      )
    )
    finish()
  }

  private fun fail(code: String, message: String) {
    val promise = pending
    pending = null
    promise?.reject(code, message, null)
    finish()
  }

  override fun onDestroy() {
    if (isFinishing && pending != null) {
      fail("UPI_CANCELLED", if (launched) "Payment was closed." else "Payment could not start.")
    }
    super.onDestroy()
  }
}
