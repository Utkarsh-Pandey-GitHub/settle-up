package expo.modules.upipayment

import android.content.Intent
import android.net.Uri
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class UpiPaymentModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("UpiPayment")

    AsyncFunction("open") { uri: String, promise: Promise ->
      val activity = appContext.currentActivity
      val parsed = runCatching { Uri.parse(uri) }.getOrNull()
      if (activity == null) {
        promise.reject("UPI_UNAVAILABLE", "Payment apps are unavailable right now.", null)
      } else if (parsed?.scheme != "upi" || parsed.host != "pay") {
        promise.reject("UPI_INVALID", "Use a valid UPI payment link.", null)
      } else if (UpiPaymentActivity.pending != null) {
        promise.reject("UPI_BUSY", "A payment app is already open.", null)
      } else {
        val paymentIntent = Intent(Intent.ACTION_VIEW, parsed)
        if (paymentIntent.resolveActivity(activity.packageManager) == null) {
          promise.reject("UPI_UNAVAILABLE", "No UPI payment app is available on this phone.", null)
          return@AsyncFunction
        }
        UpiPaymentActivity.pending = promise
        activity.runOnUiThread {
          try {
            activity.startActivity(
              Intent(activity, UpiPaymentActivity::class.java)
                .putExtra(UpiPaymentActivity.EXTRA_URI, uri)
            )
          } catch (error: Exception) {
            UpiPaymentActivity.pending = null
            promise.reject("UPI_OPEN_FAILED", "The payment app could not be opened.", error)
          }
        }
      }
    }

    OnDestroy {
      UpiPaymentActivity.pending?.reject(
        "UPI_INTERRUPTED",
        "Payment handoff was interrupted. Check your UPI app before trying again.",
        null
      )
      UpiPaymentActivity.pending = null
    }
  }
}
