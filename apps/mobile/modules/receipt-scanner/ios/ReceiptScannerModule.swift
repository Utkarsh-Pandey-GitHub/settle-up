import ExpoModulesCore
import Vision
import ImageIO

public class ReceiptScannerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReceiptScanner")
    AsyncFunction("recognize") { (uri: String) throws -> String in
      guard let url = URL(string: uri), url.isFileURL else {
        throw NSError(domain: "ReceiptScanner", code: 1, userInfo: [NSLocalizedDescriptionKey: "Choose a local bill photo."])
      }
      let request = VNRecognizeTextRequest()
      request.recognitionLevel = .accurate
      request.recognitionLanguages = ["en-US"]
      request.usesLanguageCorrection = false
      let handler = VNImageRequestHandler(url: url, options: [:])
      try handler.perform([request])
      let observations = (request.results ?? []).sorted { $0.boundingBox.midY > $1.boundingBox.midY }
      var rows: [[VNRecognizedTextObservation]] = []
      for observation in observations {
        if let anchor = rows.last?.first, abs(anchor.boundingBox.midY - observation.boundingBox.midY) < max(anchor.boundingBox.height, observation.boundingBox.height) / 2 {
          rows[rows.count - 1].append(observation)
        } else { rows.append([observation]) }
      }
      return rows.map { row in
        row.sorted { $0.boundingBox.minX < $1.boundingBox.minX }.compactMap { $0.topCandidates(1).first?.string }.joined(separator: " ")
      }.joined(separator: "\n")
    }
  }
}
