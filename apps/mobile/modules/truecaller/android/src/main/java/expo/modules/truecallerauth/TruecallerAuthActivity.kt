package expo.modules.truecallerauth

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import androidx.fragment.app.FragmentActivity
import androidx.activity.result.contract.ActivityResultContracts
import com.truecaller.android.sdk.oAuth.*
import expo.modules.kotlin.Promise
import java.security.SecureRandom

class TruecallerAuthActivity : FragmentActivity() {
  companion object { var pending: Promise? = null }
  private val handler = Handler(Looper.getMainLooper())
  private val timeout = Runnable { fail("TRUECALLER_TIMEOUT", "Truecaller did not respond within one minute. Please try again.") }
  private val state = random()
  private val verifier = CodeVerifierUtil.generateRandomCodeVerifier()
  private var initialized = false
  private val launcher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
    if (initialized) TcSdk.getInstance().onActivityResultObtained(this, result.resultCode, result.data)
  }
  private fun random(): String = ByteArray(32).also { SecureRandom().nextBytes(it) }.let { Base64.encodeToString(it, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING) }
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (savedInstanceState != null || pending == null) {
      fail("TRUECALLER_INTERRUPTED", "Verification was interrupted. Please try again.")
      return
    }
    handler.postDelayed(timeout, 60000)
    try {
      val callback = object : TcOAuthCallback {
        override fun onSuccess(data: TcOAuthData) {
          if (data.state != state) { fail("TRUECALLER_STATE", "Verification could not be confirmed. Please try again."); return }
          val promise = pending; pending = null
          promise?.resolve(mapOf("code" to data.authorizationCode, "codeVerifier" to verifier))
          finish()
        }
        override fun onFailure(error: TcOAuthError) {
          Log.w("SettleUpTruecaller", "OAuth failure type=${error.javaClass.simpleName} code=${error.errorCode} message=${error.errorMessage}")
          fail("TRUECALLER_${error.errorCode}", "Truecaller verification failed (code ${error.errorCode}). Check the app credential and try again.")
        }
        override fun onVerificationRequired(error: TcOAuthError?) {
          error?.let { Log.w("SettleUpTruecaller", "Verification required type=${it.javaClass.simpleName} code=${it.errorCode} message=${it.errorMessage}") }
          fail("TRUECALLER_VERIFICATION_REQUIRED", "Truecaller could not verify that number. Enter the number in the phone form below and use a code instead.")
        }
      }
      val options = TcSdkOptions.Builder(this, callback)
        .sdkOptions(TcSdkOptions.OPTION_VERIFY_ONLY_TC_USERS)
        .consentMode(TcSdkOptions.CONSENT_MODE_BOTTOMSHEET)
        .footerType(TcSdkOptions.FOOTER_TYPE_ANOTHER_MOBILE_NO)
        .dismissOptions(TcSdkOptions.DISMISS_OPTION_CROSS_BUTTON)
        .buttonShapeOptions(TcSdkOptions.BUTTON_SHAPE_ROUNDED)
        .build()
      Thread {
        try {
          TcSdk.init(options)
          runOnUiThread {
            if (isFinishing || isDestroyed || pending == null) return@runOnUiThread
            initialized = true
            if (!TcSdk.getInstance().isOAuthFlowUsable) {
              fail("TRUECALLER_UNAVAILABLE", "Open Truecaller and complete its profile for this number, then try again.")
              return@runOnUiThread
            }
            val challenge = CodeVerifierUtil.getCodeChallenge(verifier)
            if (challenge == null) {
              fail("TRUECALLER_PKCE", "Secure verification could not start on this device. Please try again.")
              return@runOnUiThread
            }
            TcSdk.getInstance().setOAuthState(state)
            TcSdk.getInstance().setOAuthScopes(arrayOf("openid", "phone", "profile"))
            TcSdk.getInstance().setCodeChallenge(challenge)
            TcSdk.getInstance().getAuthorizationCode(this, launcher)
          }
        } catch (e: Exception) {
          Log.e("SettleUpTruecaller", "SDK initialization failed", e)
          runOnUiThread { fail("TRUECALLER_START", "Truecaller could not start. Check the app credential and try again.") }
        }
      }.start()
    } catch (e: Exception) {
      Log.e("SettleUpTruecaller", "SDK setup failed", e)
      fail("TRUECALLER_START", "Truecaller could not start. Check the app credential and try again.")
    }
  }
  private fun fail(code: String, message: String) {
    handler.removeCallbacks(timeout)
    val promise = pending; pending = null
    promise?.reject(code, message, null)
    finish()
  }
  override fun onDestroy() {
    handler.removeCallbacks(timeout)
    if (initialized) TcSdk.clear()
    if (pending != null) { pending?.reject("CANCELLED", "Verification was closed. Please try again.", null); pending = null }
    super.onDestroy()
  }
}
