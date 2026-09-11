package expo.modules.receiptscanner

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ReceiptScannerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ReceiptScanner")
    AsyncFunction("recognize") { uri: String, promise: Promise ->
      try {
        val context = appContext.reactContext ?: throw IllegalStateException("App context unavailable")
        val parsed = Uri.parse(uri)
        require(parsed.scheme == "file" || parsed.scheme == "content") { "Choose a local bill photo" }
        val image = InputImage.fromFilePath(context, parsed)
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        recognizer.process(image)
          .addOnSuccessListener { result ->
            // Rejoin separate OCR column blocks into horizontal receipt rows.
            val lines = result.textBlocks.flatMap { it.lines }.sortedBy { it.boundingBox?.centerY() ?: 0 }
            val rows = mutableListOf<MutableList<com.google.mlkit.vision.text.Text.Line>>()
            lines.forEach { line ->
              val box = line.boundingBox
              val last = rows.lastOrNull()
              val anchor = last?.firstOrNull()?.boundingBox
              if (last != null && box != null && anchor != null && kotlin.math.abs(box.centerY() - anchor.centerY()) < maxOf(box.height(), anchor.height()) / 2) last.add(line)
              else rows.add(mutableListOf(line))
            }
            promise.resolve(rows.joinToString("\n") { row -> row.sortedBy { it.boundingBox?.left ?: 0 }.joinToString(" ") { it.text } })
          }
          .addOnFailureListener { error -> promise.reject("OCR_FAILED", "Could not read this bill. Try a sharper photo.", error) }
          .addOnCompleteListener { recognizer.close() }
      } catch (error: Exception) {
        promise.reject("OCR_FAILED", "Could not open this bill photo.", error)
      }
    }
  }
}
