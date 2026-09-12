package expo.modules.truecallerauth

import android.content.Intent
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class TruecallerAuthModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TruecallerAuth")
    AsyncFunction("authorize") { promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) promise.reject("UNAVAILABLE", "Use phone verification on this device.", null)
      else activity.runOnUiThread {
        if (TruecallerAuthActivity.pending != null) promise.reject("BUSY", "Verification is already open.", null)
        else {
          TruecallerAuthActivity.pending = promise
          try { activity.startActivity(Intent(activity, TruecallerAuthActivity::class.java)) }
          catch (e: Exception) { TruecallerAuthActivity.pending = null; promise.reject("UNAVAILABLE", "Use phone verification on this device.", e) }
        }
      }
    }
    OnDestroy {
      TruecallerAuthActivity.pending?.reject("CANCELLED", "Verification was closed. Please try again.", null)
      TruecallerAuthActivity.pending = null
    }
  }
}
