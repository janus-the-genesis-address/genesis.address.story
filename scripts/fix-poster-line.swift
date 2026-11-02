// Replace a garbled small orange "The Genesis Address" line on a poster in a sign-off picture. macOS only.
// x0 y0 x1 y1 is the box to cover. width, capHeight, startX and baselineY place the new words.
// Usage: npm run poster-line -- in.jpg out.jpg x0 y0 x1 y1 width capHeight startX baselineY   (top-left pixel coords)
import CoreGraphics
import CoreText
import Foundation
import ImageIO
import UniformTypeIdentifiers

let a = CommandLine.arguments
let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: a[1]) as CFURL, nil)!
let img = CGImageSourceCreateImageAtIndex(src, 0, nil)!
let W = img.width, H = img.height
let box = a[3...6].map { Int($0)! }
let bpr = W * 4
var buf = [UInt8](repeating: 0, count: bpr * H)
let ctx = CGContext(data: &buf, width: W, height: H, bitsPerComponent: 8, bytesPerRow: bpr,
                    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
ctx.draw(img, in: CGRect(x: 0, y: 0, width: W, height: H))

func px(_ x: Int, _ y: Int) -> (Double, Double, Double) {
    let i = y * bpr + x * 4
    return (Double(buf[i]), Double(buf[i + 1]), Double(buf[i + 2]))
}
// Find the orange text pixels.
var minX = Int.max, minY = Int.max, maxX = -1, maxY = -1
var orange: [(Double, Double, Double)] = []
for y in box[1]...box[3] { for x in box[0]...box[2] {
    let (r, g, b) = px(x, y)
    if r > 100 && r > g + 20 && r > b + 45 {
        minX = min(minX, x); maxX = max(maxX, x); minY = min(minY, y); maxY = max(maxY, y)
        orange.append((r, g, b))
    }
}}
// The text color is the average of its brightest quarter, since edge pixels blend into the board.
orange.sort { $0.0 > $1.0 }
var sum = (200.0, 120.0, 70.0), n = 1.0
if !orange.isEmpty {
    let top = orange.prefix(max(1, orange.count / 4))
    sum = top.reduce((0.0, 0.0, 0.0)) { ($0.0 + $1.0, $0.1 + $1.1, $0.2 + $1.2) }
    n = Double(top.count)
}
print("text box", minX, minY, maxX, maxY, "orange", Int(sum.0 / n), Int(sum.1 / n), Int(sum.2 / n))

// Cover the box: blend each row between the board just left and right of it.
let x0 = box[0], x1 = box[2], y0 = box[1], y1 = box[3]
for y in y0...y1 {
    let l = px(x0 - 2, y), r = px(x1 + 2, y)
    for x in x0...x1 {
        let t = Double(x - x0 + 1) / Double(x1 - x0 + 2)
        let i = y * bpr + x * 4
        buf[i] = UInt8(l.0 + (r.0 - l.0) * t)
        buf[i + 1] = UInt8(l.1 + (r.1 - l.1) * t)
        buf[i + 2] = UInt8(l.2 + (r.2 - l.2) * t)
    }
}

// Draw the right words, Helvetica, cap height and width matched to the old line.
let capH = Double(a[8])!, width = Double(a[7])!
let startX = Double(a[9])!, baseY = Double(a[10])!
let font = CTFontCreateWithName("Helvetica" as CFString, capH / 0.717, nil)
let color = CGColor(red: sum.0 / n / 255, green: sum.1 / n / 255, blue: sum.2 / n / 255, alpha: 1)
let attr = NSAttributedString(string: "The Genesis Address", attributes: [
    NSAttributedString.Key(kCTFontAttributeName as String): font,
    NSAttributedString.Key(kCTForegroundColorAttributeName as String): color,
])
let line = CTLineCreateWithAttributedString(attr)
let natural = CTLineGetTypographicBounds(line, nil, nil, nil)
ctx.saveGState()
ctx.translateBy(x: startX, y: Double(H) - baseY)
ctx.scaleBy(x: width / natural, y: 1)
ctx.textPosition = .zero
CTLineDraw(line, ctx)
ctx.restoreGState()

let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: a[2]) as CFURL, UTType.jpeg.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, ctx.makeImage()!, [kCGImageDestinationLossyCompressionQuality: 0.92] as CFDictionary)
CGImageDestinationFinalize(dest)
print("wrote", a[2])
