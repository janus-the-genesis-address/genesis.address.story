// Paste the clean "Backwards bloom" poster into a sign-off picture, warped onto four corners,
// for when the image tool garbles the poster's words. macOS only.
// Usage: npm run poster -- scene.jpg out.jpg tlx tly trx try brx bry blx bly [light]
// Corners are the poster's top-left, top-right, bottom-right and bottom-left, in pixels from the scene's top-left.
// light scales the poster's brightness to match the scene: 1 is as is, 0.8 is darker.
import CoreImage
import Foundation

let a = CommandLine.arguments
guard a.count >= 11 else {
    print("Usage: npm run poster -- scene.jpg out.jpg tlx tly trx try brx bry blx bly [light]")
    exit(1)
}
// npm runs this from the repository's root folder.
let poster = URL(fileURLWithPath: "src/content/images/2025/11/BDFD.png")
let scene = CIImage(contentsOf: URL(fileURLWithPath: a[1]))!
let card = CIImage(contentsOf: poster)!
let out = URL(fileURLWithPath: a[2])
let p = a[3...10].map { CGFloat(Double($0)!) }
let light = a.count > 11 ? CGFloat(Double(a[11])!) : 1
let H = scene.extent.height
func corner(_ i: Int) -> CIVector { CIVector(x: p[i], y: H - p[i + 1]) }

let lit = card.applyingFilter("CIColorMatrix", parameters: [
    "inputRVector": CIVector(x: light, y: 0, z: 0, w: 0),
    "inputGVector": CIVector(x: 0, y: light, z: 0, w: 0),
    "inputBVector": CIVector(x: 0, y: 0, z: light, w: 0),
])
let warped = lit.applyingFilter("CIPerspectiveTransform", parameters: [
    "inputTopLeft": corner(0), "inputTopRight": corner(2),
    "inputBottomRight": corner(4), "inputBottomLeft": corner(6),
])
// Paper glued flat throws only a thin soft shadow.
let shadow = warped.applyingFilter("CIColorMatrix", parameters: [
    "inputRVector": CIVector(x: 0, y: 0, z: 0, w: 0),
    "inputGVector": CIVector(x: 0, y: 0, z: 0, w: 0),
    "inputBVector": CIVector(x: 0, y: 0, z: 0, w: 0),
    "inputAVector": CIVector(x: 0, y: 0, z: 0, w: 0.55),
]).applyingGaussianBlur(sigma: 3).transformed(by: CGAffineTransform(translationX: 2, y: -3))

let result = warped.composited(over: shadow.composited(over: scene)).cropped(to: scene.extent)
try CIContext().writeJPEGRepresentation(
    of: result, to: out, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
    options: [CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String): 0.9])
print("wrote \(out.path)")
