// Draw a phone message as a picture for an episode: a cyberpunk phone with the sender at the top
// and the messages in bubbles, so a text Jack gets can sit in the story as a figure. macOS only.
// Usage: npm run phone -- spec.json out.jpg
// The spec is JSON:
//   {
//     "sender": "College Roommate",      shown at the top, with its first letter in the avatar
//     "detail": "Text Message",          small line under the sender (optional)
//     "time": "10:07",                   the status bar clock
//     "stamp": "Today 10:07 AM",         the grey line above the first bubble (optional)
//     "messages": [
//       { "text": "HAPPY LABOR DAY BRO." },                    from the sender
//       { "text": "On my way", "from": "me" },                 from Jack, on the right
//       { "chart": { "label": "RETURN SINCE FRI", "value": "+$61,240.18" } }   a screenshot of gains
//     ]
//   }
// For several texts from different people at once, draw the lock screen instead: leave out
// "sender" and "messages" and give "date" (optional) and "notifications":
//   { "time": "6:42", "date": "Tuesday, August 15",
//     "notifications": [ { "sender": "Sister", "text": "Jack, please tell me...", "when": "6:20 AM" } ] }
import AppKit
import Foundation

let args = CommandLine.arguments
guard args.count >= 3 else {
    print("Usage: npm run phone -- spec.json out.jpg")
    exit(1)
}

struct Chart: Decodable { let label: String; let value: String }
struct Message: Decodable { let text: String?; let from: String?; let chart: Chart? }
struct Note: Decodable { let sender: String; let text: String; let when: String? }
struct Spec: Decodable {
    let sender: String?
    let detail: String?
    let time: String
    let stamp: String?
    let date: String?
    let messages: [Message]?
    let notifications: [Note]?
}

let spec = try JSONDecoder().decode(Spec.self, from: Data(contentsOf: URL(fileURLWithPath: args[1])))

func rgb(_ hex: UInt32, _ alpha: CGFloat = 1) -> NSColor {
    NSColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255,
            blue: CGFloat(hex & 0xff) / 255, alpha: alpha)
}
let cyan = rgb(0x0abdc6), magenta = rgb(0xff2fa6), amber = rgb(0xffb000), green = rgb(0x39ff88)

// The canvas is portrait, 900 x 1200, and the post shows it with the genesis-narrow figure class.
let W: CGFloat = 900
let phone = NSRect(x: 170, y: 40, width: 560, height: 1120)
let screen = phone.insetBy(dx: 16, dy: 16)
let bubbleMax: CGFloat = 372
let pad: CGFloat = 20

func font(_ size: CGFloat, _ weight: NSFont.Weight = .regular) -> NSFont { .systemFont(ofSize: size, weight: weight) }
func mono(_ size: CGFloat, _ weight: NSFont.Weight = .regular) -> NSFont { .monospacedSystemFont(ofSize: size, weight: weight) }

func attributed(_ s: String, _ f: NSFont, _ c: NSColor, glow: NSColor? = nil, align: NSTextAlignment = .left) -> NSAttributedString {
    let p = NSMutableParagraphStyle()
    p.alignment = align
    p.lineBreakMode = .byWordWrapping
    var a: [NSAttributedString.Key: Any] = [.font: f, .foregroundColor: c, .paragraphStyle: p]
    if let g = glow {
        let sh = NSShadow()
        sh.shadowColor = g
        sh.shadowBlurRadius = 8
        sh.shadowOffset = .zero
        a[.shadow] = sh
    }
    return NSAttributedString(string: s, attributes: a)
}

func size(_ t: NSAttributedString, width: CGFloat) -> NSSize {
    let r = t.boundingRect(with: NSSize(width: width, height: 10000), options: [.usesLineFragmentOrigin, .usesFontLeading])
    return NSSize(width: ceil(r.width), height: ceil(r.height))
}

func glow(_ color: NSColor, _ blur: CGFloat, _ draw: () -> Void) {
    NSGraphicsContext.saveGraphicsState()
    let sh = NSShadow()
    sh.shadowColor = color
    sh.shadowBlurRadius = blur
    sh.shadowOffset = .zero
    sh.set()
    draw()
    NSGraphicsContext.restoreGraphicsState()
}

// Work out the bubbles first, top-down, so the picture's height fits them.
struct Placed { let rect: NSRect; let message: Message; let text: NSAttributedString? }
var placed: [Placed] = []
var y: CGFloat = 0
for m in spec.messages ?? [] {
    let mine = m.from == "me"
    if m.chart != nil {
        let w = bubbleMax, h: CGFloat = 250
        placed.append(Placed(rect: NSRect(x: mine ? screen.maxX - 24 - w : screen.minX + 24, y: y, width: w, height: h), message: m, text: nil))
        y += h + 14
    } else if let s = m.text {
        let t = attributed(s, font(27, .medium), mine ? .white : rgb(0xdcfbff), glow: mine ? magenta.withAlphaComponent(0.6) : cyan.withAlphaComponent(0.5))
        let ts = size(t, width: bubbleMax - pad * 2)
        let w = ts.width + pad * 2, h = ts.height + 28
        placed.append(Placed(rect: NSRect(x: mine ? screen.maxX - 24 - w : screen.minX + 24, y: y, width: w, height: h), message: m, text: t))
        y += h + 14
    }
}
let headerBottom: CGFloat = 300   // distance from the top of the canvas to where the bubbles start
let H: CGFloat = 1200

let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(W), pixelsHigh: Int(H), bitsPerSample: 8,
                           samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                           bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
// Flip so y runs down from the top, like the layout above, and tell AppKit so text draws upright.
let cg = NSGraphicsContext(bitmapImageRep: rep)!.cgContext
cg.translateBy(x: 0, y: H)
cg.scaleBy(x: 1, y: -1)
NSGraphicsContext.current = NSGraphicsContext(cgContext: cg, flipped: true)

// Background: near-black with a violet sky, and blurred neon behind the phone.
NSGradient(colors: [rgb(0x05060c), rgb(0x150a2a), rgb(0x05060c)])!.draw(in: NSRect(x: 0, y: 0, width: W, height: H), angle: 90)
for (c, r) in [(cyan, NSRect(x: -120, y: 40, width: 640, height: 640)), (magenta, NSRect(x: 420, y: 560, width: 620, height: 700)), (amber, NSRect(x: 520, y: -60, width: 420, height: 420))] {
    let g = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                       colors: [c.withAlphaComponent(0.34).cgColor, c.withAlphaComponent(0).cgColor] as CFArray, locations: [0, 1])!
    let mid = CGPoint(x: r.midX, y: r.midY)
    cg.drawRadialGradient(g, startCenter: mid, startRadius: 0, endCenter: mid, endRadius: r.width / 2, options: [])
}

// The phone: dark body, cyan edge, glow.
let body = NSBezierPath(roundedRect: phone, xRadius: 82, yRadius: 82)
glow(cyan.withAlphaComponent(0.9), 46) { rgb(0x0a0d15).setFill(); body.fill() }
cyan.setStroke(); body.lineWidth = 4; body.stroke()
let screenPath = NSBezierPath(roundedRect: screen, xRadius: 66, yRadius: 66)
NSGraphicsContext.saveGraphicsState()
screenPath.addClip()
NSGradient(colors: [rgb(0x070a13), rgb(0x0c0a1e), rgb(0x12061c)])!.draw(in: screen, angle: -90)
// Faint scan lines.
rgb(0xffffff, 0.025).setFill()
var s = screen.minY
while s < screen.maxY { NSRect(x: screen.minX, y: s, width: screen.width, height: 2).fill(); s += 6 }

// Status bar and the island.
let island = NSRect(x: phone.midX - 82, y: screen.minY + 20, width: 164, height: 46)
rgb(0x000000).setFill(); NSBezierPath(roundedRect: island, xRadius: 23, yRadius: 23).fill()
attributed(spec.time, font(26, .semibold), .white).draw(at: NSPoint(x: screen.minX + 58, y: screen.minY + 28))
// Signal bars and battery on the right.
NSColor.white.setFill()
for i in 0..<4 {
    let h = CGFloat(8 + i * 5)
    NSBezierPath(roundedRect: NSRect(x: screen.maxX - 150 + CGFloat(i) * 10, y: screen.minY + 52 - h, width: 6, height: h), xRadius: 1.5, yRadius: 1.5).fill()
}
let battery = NSRect(x: screen.maxX - 98, y: screen.minY + 32, width: 44, height: 21)
NSColor.white.setStroke()
let bp = NSBezierPath(roundedRect: battery, xRadius: 6, yRadius: 6); bp.lineWidth = 2; bp.stroke()
green.setFill(); NSBezierPath(roundedRect: battery.insetBy(dx: 4, dy: 4), xRadius: 3, yRadius: 3).fill()
NSColor.white.setFill(); NSBezierPath(roundedRect: NSRect(x: battery.maxX + 3, y: battery.midY - 4, width: 3, height: 8), xRadius: 1, yRadius: 1).fill()

if let notes = spec.notifications {
    // Lock screen: big clock, the date, then one glowing card per text, newest first.
    let clock = attributed(spec.time, font(120, .semibold), .white, glow: cyan.withAlphaComponent(0.8), align: .center)
    let csz = size(clock, width: screen.width)
    if let d = spec.date {
        attributed(d, font(26, .medium), rgb(0xcfe9f5), align: .center).draw(in: NSRect(x: screen.minX, y: screen.minY + 100, width: screen.width, height: 34))
    }
    clock.draw(in: NSRect(x: screen.minX, y: screen.minY + 132, width: screen.width, height: csz.height))
    var cy = screen.minY + 132 + csz.height + 40
    for (i, n) in notes.enumerated() {
        let edge = i % 2 == 0 ? cyan : magenta
        let body = attributed(n.text, font(23), rgb(0xdcfbff))
        let bsz = size(body, width: screen.width - 48 - 100)
        let card = NSRect(x: screen.minX + 24, y: cy, width: screen.width - 48, height: bsz.height + 76)
        let cp = NSBezierPath(roundedRect: card, xRadius: 26, yRadius: 26)
        glow(edge.withAlphaComponent(0.5), 18) { rgb(0x0f1626, 0.92).setFill(); cp.fill() }
        edge.withAlphaComponent(0.8).setStroke(); cp.lineWidth = 2; cp.stroke()
        let av = NSRect(x: card.minX + 18, y: card.minY + 18, width: 50, height: 50)
        NSGradient(colors: [magenta, rgb(0x6a2cff)])!.draw(in: NSBezierPath(ovalIn: av), angle: -60)
        let ini = attributed(String(n.sender.prefix(1)).uppercased(), font(24, .bold), .white, align: .center)
        ini.draw(in: NSRect(x: av.minX, y: av.midY - size(ini, width: 50).height / 2, width: 50, height: 30))
        attributed(n.sender, font(23, .semibold), .white).draw(at: NSPoint(x: card.minX + 84, y: card.minY + 14))
        if let w = n.when {
            let ws = attributed(w, font(18), rgb(0x8fa3b8))
            ws.draw(at: NSPoint(x: card.maxX - 18 - size(ws, width: 200).width, y: card.minY + 18))
        }
        body.draw(in: NSRect(x: card.minX + 84, y: card.minY + 48, width: bsz.width + 4, height: bsz.height))
        cy = card.maxY + 16
    }
    // Flashlight and camera buttons at the bottom corners.
    for x in [screen.minX + 60, screen.maxX - 120] {
        let b = NSRect(x: x, y: screen.maxY - 130, width: 60, height: 60)
        rgb(0x1a2233, 0.9).setFill(); NSBezierPath(ovalIn: b).fill()
    }
} else {
// Header: back arrow, avatar with the sender's first letter, name, detail line.
let sender = spec.sender ?? ""
attributed("‹", font(56, .regular), cyan, glow: cyan).draw(at: NSPoint(x: screen.minX + 26, y: screen.minY + 92))
let avatar = NSRect(x: phone.midX - 42, y: screen.minY + 92, width: 84, height: 84)
glow(magenta, 22) { NSGradient(colors: [magenta, rgb(0x6a2cff)])!.draw(in: NSBezierPath(ovalIn: avatar), angle: -60) }
let initial = attributed(String(sender.prefix(1)).uppercased(), font(40, .bold), .white, align: .center)
let isz = size(initial, width: 84)
initial.draw(in: NSRect(x: avatar.minX, y: avatar.midY - isz.height / 2, width: 84, height: isz.height))
let name = attributed(sender + "  ›", font(26, .semibold), .white, glow: cyan.withAlphaComponent(0.7), align: .center)
name.draw(in: NSRect(x: screen.minX, y: avatar.maxY + 12, width: screen.width, height: 36))
if let d = spec.detail {
    attributed(d, font(19), rgb(0x8fa3b8), align: .center).draw(in: NSRect(x: screen.minX, y: avatar.maxY + 48, width: screen.width, height: 26))
}
cyan.withAlphaComponent(0.35).setFill()
NSRect(x: screen.minX, y: screen.minY + headerBottom - 34, width: screen.width, height: 1.5).fill()

// Messages.
var top = screen.minY + headerBottom
if let st = spec.stamp {
    attributed(st, font(18, .medium), rgb(0x7f8ea3), align: .center).draw(in: NSRect(x: screen.minX, y: top - 14, width: screen.width, height: 24))
    top += 26
}
for p in placed {
    let r = p.rect.offsetBy(dx: 0, dy: top)
    let mine = p.message.from == "me"
    let edge = mine ? magenta : cyan
    let bubble = NSBezierPath(roundedRect: r, xRadius: 28, yRadius: 28)
    glow(edge.withAlphaComponent(0.55), 18) { (mine ? rgb(0x3a0f33) : rgb(0x101a2b)).setFill(); bubble.fill() }
    edge.withAlphaComponent(0.85).setStroke(); bubble.lineWidth = 2; bubble.stroke()
    if let t = p.text {
        t.draw(in: NSRect(x: r.minX + pad, y: r.minY + 14, width: r.width - pad * 2, height: r.height - 28))
    } else if let c = p.message.chart {
        // A screenshot of a portfolio: grid, a green line climbing off the top, the label and the number.
        let panel = r.insetBy(dx: 12, dy: 12)
        let pp = NSBezierPath(roundedRect: panel, xRadius: 18, yRadius: 18)
        rgb(0x04070c).setFill(); pp.fill()
        NSGraphicsContext.saveGraphicsState()
        pp.addClip()
        rgb(0x1d2a3a).setFill()
        for i in 1..<5 { NSRect(x: panel.minX, y: panel.minY + CGFloat(i) * panel.height / 5, width: panel.width, height: 1).fill() }
        let line = NSBezierPath()
        let base = panel.maxY - 70
        line.move(to: NSPoint(x: panel.minX, y: base))
        let pts: [(CGFloat, CGFloat)] = [(0.12, 4), (0.22, 10), (0.30, 6), (0.40, 22), (0.50, 30), (0.58, 52), (0.66, 70), (0.74, 104), (0.82, 140), (0.90, 196), (1.02, 260)]
        for (fx, dy) in pts { line.line(to: NSPoint(x: panel.minX + panel.width * fx, y: base - dy)) }
        line.lineWidth = 4; line.lineJoinStyle = .round
        glow(green, 14) { green.setStroke(); line.stroke() }
        NSGraphicsContext.restoreGraphicsState()
        attributed(c.label, mono(17, .semibold), rgb(0x9fb3c8)).draw(at: NSPoint(x: panel.minX + 16, y: panel.maxY - 58))
        attributed(c.value, mono(26, .bold), green, glow: green).draw(at: NSPoint(x: panel.minX + 16, y: panel.maxY - 38))
    }
}

// Input bar and home indicator.
let bar = NSRect(x: screen.minX + 78, y: screen.maxY - 102, width: screen.width - 110, height: 52)
let barPath = NSBezierPath(roundedRect: bar, xRadius: 26, yRadius: 26)
rgb(0x0e1422).setFill(); barPath.fill()
cyan.withAlphaComponent(0.4).setStroke(); barPath.lineWidth = 1.5; barPath.stroke()
attributed("Text Message", font(21), rgb(0x5e6e82)).draw(at: NSPoint(x: bar.minX + 22, y: bar.minY + 13))
attributed("+", font(40, .light), cyan, glow: cyan).draw(at: NSPoint(x: screen.minX + 28, y: bar.minY - 1))
}
NSColor.white.withAlphaComponent(0.85).setFill()
NSBezierPath(roundedRect: NSRect(x: phone.midX - 80, y: screen.maxY - 24, width: 160, height: 7), xRadius: 3.5, yRadius: 3.5).fill()
NSGraphicsContext.restoreGraphicsState()   // the screen clip

NSGraphicsContext.restoreGraphicsState()
let jpg = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.9])!
try jpg.write(to: URL(fileURLWithPath: args[2]))
print("wrote \(args[2]), \(Int(W)) x \(Int(H))")
