package expo.modules.truecallerauth

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Base64
import androidx.fragment.app.FragmentActivity
import androidx.activity.result.contract.ActivityResultContracts
import com.truecaller.android.sdk.oAuth.*
import expo.modules.kotlin.Promise
import java.security.SecureRandom
import java.security.MessageDigest

class TruecallerAuthActivity : FragmentActivity() {
  companion object { var pending: Promise? = null }
  private val handler = Handler(Looper.getMainLooper())
  private val timeout = Runnable { fail("Verification timed out. Use phone verification or try again.") }
  private val state = random()
  private val verifier = random()
  private var initialized = false
  private val launcher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
    if (initialized) TcSdk.getInstance().onActivityResultObtained(this, result.resultCode, result.data)
  }
  private fun random(): String = ByteArray(32).also { SecureRandom().nextBytes(it) }.let { Base64.encodeToString(it, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING) }
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (savedInstanceState != null || pending == null) { fail("Verification was interrupted. Please try again."); return }
    handler.postDelayed(timeout, 120000)
    try {
      val callback = object : TcOAuthCallback {
        override fun onSuccess(data: TcOAuthData) {
          if (data.state != state) { fail("Verification could not be confirmed. Please try again."); return }
          val promise = pending; pending = null
          promise?.resolve(mapOf("code" to data.authorizationCode, "codeVerifier" to verifier))
          finish()
        }
        override fun onFailure(error: TcOAuthError) { fail("Truecaller was cancelled or unavailable. Use phone verification.") }
        override fun onVerificationRequired(error: TcOAuthError?) { fail("Use phone verification to continue.") }
      }
      TcSdk.init(TcSdkOptions.Builder(this, callback).sdkOptions(TcSdkOptions.OPTION_VERIFY_ONLY_TC_USERS).build())
      initialized = true
      if (!TcSdk.getInstance().isOAuthFlowUsable) { fail("Truecaller is not available. Use phone verification."); return }
      TcSdk.getInstance().setOAuthState(state)
      TcSdk.getInstance().setOAuthScopes(arrayOf("openid", "phone", "profile"))
      val challenge = Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII)), Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
      TcSdk.getInstance().setCodeChallenge(challenge)
      TcSdk.getInstance().getAuthorizationCode(this, launcher)
    } catch (e: Exception) { fail("Truecaller could not start. Use phone verification.") }
  }
  private fun fail(message: String) {
    val promise = pending; pending = null
    promise?.reject("TRUECALLER_FAILED", message, null)
    finish()
  }
  override fun onDestroy() {
    handler.removeCallbacks(timeout)
    if (initialized) TcSdk.clear()
    if (pending != null) { pending?.reject("CANCELLED", "Verification was closed. Please try again.", null); pending = null }
    super.onDestroy()
  }
}
