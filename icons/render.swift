import AppKit
import Foundation

func renderIcon(size: Int, output: URL) throws {
    guard let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: size,
        pixelsHigh: size,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    ) else { return }

    NSGraphicsContext.saveGraphicsState()
    guard let context = NSGraphicsContext(bitmapImageRep: bitmap) else { return }
    NSGraphicsContext.current = context
    context.cgContext.scaleBy(x: CGFloat(size) / 128, y: CGFloat(size) / 128)
    context.cgContext.setAllowsAntialiasing(true)

    let tile = NSBezierPath(roundedRect: NSRect(x: 8, y: 8, width: 112, height: 112), xRadius: 28, yRadius: 28)
    NSColor(calibratedRed: 0.03, green: 0.50, blue: 0.50, alpha: 1).setFill()
    tile.fill()

    let bookmark = NSBezierPath()
    bookmark.move(to: NSPoint(x: 50, y: 107))
    bookmark.curve(to: NSPoint(x: 40, y: 97), controlPoint1: NSPoint(x: 44.5, y: 107), controlPoint2: NSPoint(x: 40, y: 102.5))
    bookmark.line(to: NSPoint(x: 40, y: 23))
    bookmark.line(to: NSPoint(x: 64, y: 39))
    bookmark.line(to: NSPoint(x: 88, y: 23))
    bookmark.line(to: NSPoint(x: 88, y: 97))
    bookmark.curve(to: NSPoint(x: 78, y: 107), controlPoint1: NSPoint(x: 88, y: 102.5), controlPoint2: NSPoint(x: 83.5, y: 107))
    bookmark.close()
    NSColor.white.setFill()
    bookmark.fill()

    let check = NSBezierPath()
    check.move(to: NSPoint(x: 51, y: 69))
    check.line(to: NSPoint(x: 60, y: 60))
    check.line(to: NSPoint(x: 78, y: 80))
    check.lineWidth = 7
    check.lineCapStyle = .round
    check.lineJoinStyle = .round
    NSColor(calibratedRed: 0.03, green: 0.50, blue: 0.50, alpha: 1).setStroke()
    check.stroke()

    context.flushGraphics()
    NSGraphicsContext.restoreGraphicsState()
    guard let data = bitmap.representation(using: .png, properties: [:]) else { return }
    try data.write(to: output)
}

let directory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
for size in [16, 32, 48, 128] {
    try renderIcon(size: size, output: directory.appendingPathComponent("icon\(size).png"))
}
